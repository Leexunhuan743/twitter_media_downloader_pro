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

// 回归：WithoutClaimsValidation 会跳过整个 validator，因此 iss/sub 必须显式断言，
// 否则注释声称的校验并不存在（WithIssuer/WithSubject 只是给被跳过的 validator 传期望值）。
func TestEnforceMaxRefreshAgeRejectsWrongIssuerOrSubject(t *testing.T) {
	const apiKey = "refresh-age-key"
	now := time.Now()
	sign := func(iss, sub string) string {
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    iss,
				Subject:   sub,
				IssuedAt:  jwt.NewNumericDate(now.Add(-time.Hour)),
				ExpiresAt: jwt.NewNumericDate(now.Add(-30 * time.Minute)),
				ID:        "wrong-claims",
			},
		})
		signed, err := tok.SignedString(deriveJWTSecret(apiKey))
		require.NoError(t, err)
		return signed
	}

	require.Error(t, enforceMaxRefreshAge(sign("not-tmd", jwtSubject), apiKey), "wrong issuer must be rejected")
	require.Error(t, enforceMaxRefreshAge(sign(jwtIssuer, "not-tmd-session"), apiKey), "wrong subject must be rejected")
	require.NoError(t, enforceMaxRefreshAge(sign(jwtIssuer, jwtSubject), apiKey), "correct issuer/subject must pass")
}

// 回归：过期且已超出续期窗口（24h）的令牌，auth/check 必须与 refresh 一致地
// 给出 401 + X-Token-Type: too-old，否则前端探测永远 200、死令牌清不掉。
func TestAuthCheckRejectsNonRenewableSession(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	server.config = &config.Config{APIKey: "check-age-key"}
	server.botCallbackPaths = make(map[string]struct{})
	server.authRateLimit = &authRateLimiter{
		attempts: make(map[string]*rateLimitEntry),
		stopCh:   make(chan struct{}),
	}
	defer server.authRateLimit.Stop()

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
	token, err := old.SignedString(deriveJWTSecret("check-age-key"))
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/check?token="+token, nil)
	rr := httptest.NewRecorder()
	server.handleAuthCheck(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Equal(t, "too-old", rr.Header().Get("X-Token-Type"))
}
