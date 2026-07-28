package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"
)

// JWT constants
const (
	jwtIssuer        = "tmd"
	jwtSubject       = "tmd-session"
	jwtTokenTTL      = 1 * time.Hour
	jwtRefreshMargin = 5 * time.Minute // refresh when less than 5 min remaining
	jwtSigningCtx    = "tmd-jwt-v1"    // HMAC derivation context
)

// deriveJWTSecret derives a 256-bit HMAC key from the API Key.
// Using a derived key means: if jwt_secret leaks, the original api_key is unaffected.
func deriveJWTSecret(apiKey string) []byte {
	mac := hmac.New(sha256.New, []byte(jwtSigningCtx))
	mac.Write([]byte(apiKey))
	return mac.Sum(nil)
}

// jwtClaims are the custom JWT claims for TMD sessions.
type jwtClaims struct {
	jwt.RegisteredClaims
}

// generateSessionToken creates a signed JWT session token.
// The token is signed with a key derived from the apiKey.
func generateSessionToken(apiKey string) (string, error) {
	now := time.Now()
	claims := jwtClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jwtIssuer,
			Subject:   jwtSubject,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(jwtTokenTTL)),
			ID:        fmt.Sprintf("%d", now.UnixNano()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := deriveJWTSecret(apiKey)
	return token.SignedString(secret)
}

// validateSessionToken parses and validates a JWT session token.
// It verifies the signature using the derived key, checks expiry,
// and validates standard claims (issuer, subject).
func validateSessionToken(tokenString string, apiKey string) (*jwt.Token, error) {
	secret := deriveJWTSecret(apiKey)

	token, err := jwt.ParseWithClaims(tokenString, &jwtClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	},
		jwt.WithIssuer(jwtIssuer),
		jwt.WithSubject(jwtSubject),
		jwt.WithLeeway(30*time.Second),
		jwt.WithValidMethods([]string{"HS256"}),
	)
	if err != nil {
		return nil, err
	}
	return token, nil
}

// ---- HTTP Handlers ----

// handleAuthLogin accepts an API Key and returns a JWT session token.
// This endpoint is public so clients can authenticate before having a JWT.
func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract API Key
	token := extractBearerToken(r)
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Read current API Key first — before rate limiting,
	// so empty API key doesn't consume rate limit quota
	s.configMu.RLock()
	apiKey := s.config.APIKey
	s.configMu.RUnlock()

	if apiKey == "" {
		log.Warn("[auth] API key missing")
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Rate limit check (基于纯 IP，排除端口)
	clientAddr := clientIP(r.RemoteAddr)
	if !s.authRateLimit.Allow(clientAddr) {
		log.Warnf("[auth] Rate limit exceeded ip=%s operation=login", clientAddr)
		s.writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}

	// Validate
	if token != apiKey {
		s.authRateLimit.Fail(clientAddr)
		log.Warnf("[auth] Login rejected ip=%s reason=api_key_mismatch", clientAddr)
		if token != "" {
			log.Debugf("[auth] Rejected token fingerprint=%s", logging.MaskSecret(token))
		}
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	jwtToken, err := generateSessionToken(apiKey)
	if err != nil {
		log.Errorf("[auth] Token generate failed operation=login error=%q", err.Error())
		s.writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	expiry := time.Now().Add(jwtTokenTTL)
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
		"token":      jwtToken,
		"expires_at": expiry.UTC().Format(time.RFC3339),
		"expires_in": int(jwtTokenTTL.Seconds()),
	}))
}

// handleAuthRefresh accepts a valid JWT and returns a new JWT with fresh expiry.
func (s *Server) handleAuthRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	tokenStr := extractBearerToken(r)
	if tokenStr == "" {
		tokenStr = r.URL.Query().Get("token")
	}
	if tokenStr == "" {
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	s.configMu.RLock()
	apiKey := s.config.APIKey
	s.configMu.RUnlock()

	if apiKey == "" {
		log.Warn("[auth] API key missing")
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Rate limit check
	clientAddr := clientIP(r.RemoteAddr)
	if !s.authRateLimit.Allow(clientAddr) {
		log.Warnf("[auth] Rate limit exceeded ip=%s operation=refresh", clientAddr)
		s.writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}

	// Validate the JWT — accept expired tokens too (the client is trying to refresh them)
	_, err := validateSessionToken(tokenStr, apiKey)
	if err != nil && !isJWTExpiredError(err) {
		// Token is invalid (bad signature, wrong format, etc.)
		w.Header().Set("X-Token-Type", "invalid")
		log.Warnf("[auth] Refresh rejected ip=%s error=%q", clientAddr, err.Error())
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Expired JWT with valid signature is acceptable for refresh

	// Generate new JWT
	jwtToken, err := generateSessionToken(apiKey)
	if err != nil {
		log.Errorf("[auth] Token generate failed operation=refresh error=%q", err.Error())
		s.writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	expiry := time.Now().Add(jwtTokenTTL)
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
		"token":      jwtToken,
		"expires_at": expiry.UTC().Format(time.RFC3339),
		"expires_in": int(jwtTokenTTL.Seconds()),
	}))
}

// handleAuthCheck returns the current JWT status.
// Requires a valid JWT (handled by authMiddleware).
func (s *Server) handleAuthCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Read API Key first — determines whether auth is enabled at all
	s.configMu.RLock()
	apiKey := s.config.APIKey
	s.configMu.RUnlock()

	authEnabled := apiKey != ""

	tokenStr := extractBearerToken(r)
	if tokenStr == "" {
		tokenStr = r.URL.Query().Get("token")
	}

	if tokenStr == "" {
		s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
			"authenticated": false,
			"auth_enabled":  authEnabled,
		}))
		return
	}

	// Rate limit check
	clientAddr := clientIP(r.RemoteAddr)
	if !s.authRateLimit.Allow(clientAddr) {
		log.Warnf("[auth] Rate limit exceeded ip=%s operation=check", clientAddr)
		s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
			"authenticated": false,
			"auth_enabled":  authEnabled,
			"valid":         false,
			"error":         "too many requests",
		}))
		return
	}

	if apiKey == "" {
		s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
			"authenticated": false,
			"auth_enabled":  false,
		}))
		return
	}

	token, err := validateSessionToken(tokenStr, apiKey)
	if err != nil {
		isExpired := isJWTExpiredError(err)
		errMsg := "token invalid"
		if isExpired {
			errMsg = "token expired"
		}
		log.Debugf("[auth] Check rejected ip=%s expired=%t error=%q", clientAddr, isExpired, err.Error())
		s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
			"authenticated": false,
			"auth_enabled":  true,
			"valid":         false,
			"expired":       isExpired,
			"error":         errMsg,
		}))
		return
	}

	claims, ok := token.Claims.(*jwtClaims)
	if !ok {
		log.Errorf("[auth] Check failed reason=unexpected_claims_type type=%T", token.Claims)
		s.writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	exp := claims.ExpiresAt.Time
	remaining := time.Until(exp)

	s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
		"authenticated": true,
		"auth_enabled":  true,
		"valid":         true,
		"expires_at":    exp.UTC().Format(time.RFC3339),
		"expires_in":    int(remaining.Seconds()),
		"needs_refresh": remaining < jwtRefreshMargin,
	}))
}

// ---- Helpers ----

// clientIP 从 RemoteAddr（格式 "host:port"）中提取纯 IP 地址。
// 如果解析失败，返回原始字符串作为 fallback。
func clientIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

// isJWTExpiredError returns true if the error is due to token expiration.
func isJWTExpiredError(err error) bool {
	return errors.Is(err, jwt.ErrTokenExpired)
}

// ---- Rate Limiter ----

// authRateLimiter is a simple in-memory rate limiter for the login endpoint.
type authRateLimiter struct {
	mu       sync.Mutex
	attempts map[string]*rateLimitEntry
	stopCh   chan struct{}
}

type rateLimitEntry struct {
	count       int
	windowStart time.Time
}

const (
	maxLoginAttempts = 5
	loginWindow      = 1 * time.Minute
)

func (rl *authRateLimiter) Allow(addr string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	entry, exists := rl.attempts[addr]
	if !exists || now.Sub(entry.windowStart) > loginWindow {
		rl.attempts[addr] = &rateLimitEntry{
			count:       0,
			windowStart: now,
		}
		return true
	}
	return entry.count < maxLoginAttempts
}

func (rl *authRateLimiter) Fail(addr string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	entry, exists := rl.attempts[addr]
	if !exists || time.Since(entry.windowStart) > loginWindow {
		rl.attempts[addr] = &rateLimitEntry{
			count:       1,
			windowStart: time.Now(),
		}
		return
	}
	entry.count++
}

func (rl *authRateLimiter) cleanupExpired() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for key, entry := range rl.attempts {
		if now.Sub(entry.windowStart) > loginWindow {
			delete(rl.attempts, key)
		}
	}
}

// Stop stops the background cleanup goroutine. Safe to call multiple times.
func (rl *authRateLimiter) Stop() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	select {
	case <-rl.stopCh:
		// already closed
	default:
		close(rl.stopCh)
	}
}

// startCleanupLoop runs a background goroutine that periodically removes expired entries.
func (rl *authRateLimiter) startCleanupLoop() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.cleanupExpired()
			case <-rl.stopCh:
				return
			}
		}
	}()
}
