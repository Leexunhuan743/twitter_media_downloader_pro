package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/config"
)

// P2-6 修复回归：refresh 只允许未过期或短暂过期（宽限期）内的 JWT。
// 任意年代的过期 JWT 必须被拒绝——否则被盗令牌在 API Key 更换前永续有效。
func TestRefreshRejectsAncientExpiredToken(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	server.config = &config.Config{APIKey: "refresh-age-key"}
	server.botCallbackPaths = make(map[string]struct{})
	server.authRateLimit = &authRateLimiter{
		attempts: make(map[string]*rateLimitEntry),
		stopCh:   make(chan struct{}),
	}
	defer server.authRateLimit.Stop()

	// 构造一个 90 天前签发且早已过期的合法签名 JWT（模拟被盗令牌长期续期）。
	const apiKey = "refresh-age-key"
	now := time.Now()
	old := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jwtIssuer,
			Subject:   jwtSubject,
			IssuedAt:  jwt.NewNumericDate(now.Add(-90 * 24 * time.Hour)),
			ExpiresAt: jwt.NewNumericDate(now.Add(-89 * 24 * time.Hour)),
			ID:        "ancient-token",
		},
	})
	oldToken, err := old.SignedString(deriveJWTSecret(apiKey))
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh?token="+oldToken, nil)
	rr := httptest.NewRecorder()
	server.handleAuthRefresh(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code, "ancient expired JWT must not be refreshable")
}

// P2-6 回归保护：未过期或宽限期内的令牌仍可正常 refresh。
func TestRefreshAcceptsFreshExpiredToken(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	server.config = &config.Config{APIKey: "refresh-fresh-key"}
	server.botCallbackPaths = make(map[string]struct{})
	server.authRateLimit = &authRateLimiter{
		attempts: make(map[string]*rateLimitEntry),
		stopCh:   make(chan struct{}),
	}
	defer server.authRateLimit.Stop()

	const apiKey = "refresh-fresh-key"
	now := time.Now()
	recent := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jwtIssuer,
			Subject:   jwtSubject,
			IssuedAt:  jwt.NewNumericDate(now.Add(-30 * time.Minute)),
			ExpiresAt: jwt.NewNumericDate(now.Add(-time.Minute)),
			ID:        "recent-token",
		},
	})
	recentToken, err := recent.SignedString(deriveJWTSecret(apiKey))
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh?token="+recentToken, nil)
	rr := httptest.NewRecorder()
	server.handleAuthRefresh(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code, "recently expired JWT should still refresh")
	// 返回了新令牌
	var resp struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.NotEmpty(t, resp.Data.Token)
	assert.NotEqual(t, recentToken, resp.Data.Token, "refresh must mint a new token")
}
