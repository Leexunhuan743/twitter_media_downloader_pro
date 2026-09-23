package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
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
	// jwtMaxRefreshAge 限制 refresh 链的存活窗口：过期 JWT 只有在签发后
	// 该时长内可续期。防止被盗令牌无限期续期（唯一吊销手段是轮换 api_key）。
	jwtMaxRefreshAge = 24 * time.Hour
	jwtSigningCtx    = "tmd-jwt-v1" // HMAC derivation context
)

// enforceMaxRefreshAge rejects refresh tokens whose original issuance is older
// than jwtMaxRefreshAge. The refresh window is measured from IssuedAt so a
// continuously-refreshed session (each new token re-issues now) stays valid,
// while an abandoned ancient token cannot be revived. It parses the token
// again without the expiry check because validateSessionToken returns a nil
// token (not just an error) once the token is expired.
func enforceMaxRefreshAge(tokenString string, apiKey string) error {
	secret := deriveJWTSecret(apiKey)
	parsed, err := jwt.ParseWithClaims(tokenString, &jwtClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		// 只解析并验证签名，不校验过期——过期正是本函数需要检查的状态
		// （golang-jwt 默认在过期时返回 nil token）。
		// 注意：WithoutClaimsValidation 会跳过整个 validator，因此这里**不要**
		// 再写 WithIssuer/WithSubject（它们只会写进被跳过的 validator，恒不生效）；
		// iss/sub 由下方显式断言校验。
		jwt.WithoutClaimsValidation(),
	)
	if err != nil {
		return fmt.Errorf("parse token for age check: %w", err)
	}
	claims, ok := parsed.Claims.(*jwtClaims)
	if !ok || claims == nil || claims.IssuedAt == nil {
		return fmt.Errorf("token has no issued-at claim")
	}
	// jwt.WithoutClaimsValidation 会跳过整个 validator，因此 WithIssuer/
	// WithSubject 在此调用链上不生效 —— iss/sub 必须显式断言。
	if claims.Issuer != jwtIssuer || claims.Subject != jwtSubject {
		return fmt.Errorf("unexpected token issuer or subject")
	}
	if time.Since(claims.IssuedAt.Time) > jwtMaxRefreshAge {
		return fmt.Errorf("token issued more than %s ago", jwtMaxRefreshAge)
	}
	return nil
}

// secureEqual 常量时间比较两个秘密字符串。
// 先各自 sha256 再比较：既让比较耗时与匹配前缀无关，也不泄漏长度。
func secureEqual(a, b string) bool {
	sumA := sha256.Sum256([]byte(a))
	sumB := sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(sumA[:], sumB[:]) == 1
}

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

	// Validate（常量时间比较，避免按字节逐位推断密钥）
	if !secureEqual(token, apiKey) {
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
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(tokenResponsePayload(jwtToken, expiry, int(jwtTokenTTL.Seconds()))))
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
	if _, err := validateSessionToken(tokenStr, apiKey); err != nil && !isJWTExpiredError(err) {
		// Token is invalid (bad signature, wrong format, etc.)
		w.Header().Set("X-Token-Type", "invalid")
		log.Warnf("[auth] Refresh rejected ip=%s error=%q", clientAddr, err.Error())
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Expired JWT with valid signature is acceptable for refresh — but only
	// within the maximum refresh window. A token issued arbitrarily long ago
	// (e.g. stolen and refreshed forever) must not be renewable; the only
	// existing revocation mechanism (rotating api_key) would otherwise be
	// useless against a leaked session.
	if err := enforceMaxRefreshAge(tokenStr, apiKey); err != nil {
		w.Header().Set("X-Token-Type", "too-old")
		log.Warnf("[auth] Refresh rejected ip=%s error=%q", clientAddr, err.Error())
		s.writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Generate new JWT
	jwtToken, err := generateSessionToken(apiKey)
	if err != nil {
		log.Errorf("[auth] Token generate failed operation=refresh error=%q", err.Error())
		s.writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	expiry := time.Now().Add(jwtTokenTTL)
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(tokenResponsePayload(jwtToken, expiry, int(jwtTokenTTL.Seconds()))))
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
		// 过期且已超出续期窗口（jwtMaxRefreshAge）的会话无法恢复：refresh 会
		// 返回 too-old，客户端若只靠本端点探测就会一直留着死令牌、既不刷新也
		// 不重新登录。这里与 refresh 给出一致的信号（401 + X-Token-Type）。
		if isExpired && enforceMaxRefreshAge(tokenStr, apiKey) != nil {
			log.Debugf("[auth] Check rejected ip=%s reason=too_old", clientAddr)
			w.Header().Set("X-Token-Type", "too-old")
			s.writeError(w, http.StatusUnauthorized, "session expired beyond refresh window")
			return
		}
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

	// 复用登录/刷新共用的 expires_at/expires_in 构造；原校验响应不含 token 字段，
	// 传空 token 以保持逐字一致，再追加校验状态字段
	payload := tokenResponsePayload("", exp, int(remaining.Seconds()))
	payload["authenticated"] = true
	payload["auth_enabled"] = true
	payload["valid"] = true
	payload["needs_refresh"] = remaining < jwtRefreshMargin
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(payload))
}

// ---- Helpers ----

// tokenResponsePayload 构造会话令牌响应的公共字段。
// 登录/刷新端点返回 token/expires_at/expires_in 三字段；handleAuthCheck 只复用
// expires_at/expires_in（原校验响应不含 token 字段，保持逐字一致，故传入空 token
// 时省略该字段）。expiresIn 由调用方按原有语义计算传入（登录/刷新为 TTL 秒数、
// 校验为剩余秒数），保证整型截断与改造前完全一致。
func tokenResponsePayload(token string, expiry time.Time, expiresIn int) map[string]interface{} {
	payload := map[string]interface{}{
		"expires_at": expiry.UTC().Format(time.RFC3339),
		"expires_in": expiresIn,
	}
	if token != "" {
		payload["token"] = token
	}
	return payload
}

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
