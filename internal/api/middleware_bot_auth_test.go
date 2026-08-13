package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/unkmonster/tmd/internal/config"
)

// P1-3 修复回归：启用 API Key 后，已注册的 bot 回调路径（Feishu）必须
// 免 TMD 认证（第三方平台不带 TMD Bearer，自身用 verify_token 校验），
// 而未注册的 /api/v1/bot/ 路径仍必须 401——不能用宽泛前缀放行。
func TestBotCallbackBypassesAuthWhenRegistered(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	server.config = &config.Config{APIKey: "test-api-key"}
	server.botCallbackPaths = make(map[string]struct{})

	reached := make(chan struct{}, 1)
	server.RegisterBotCallback("/api/v1/bot/feishu/callback", func(w http.ResponseWriter, r *http.Request) {
		reached <- struct{}{}
		w.WriteHeader(http.StatusOK)
	})
	// next 模拟 mux 行为：已注册回调路径路由到回调，其余走默认 handler。
	handler := server.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cb, ok := server.botCallbacks[r.URL.Path]; ok {
			cb(w, r)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	// 已注册路径：无 Bearer 也应到达回调（200）。
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bot/feishu/callback", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
	select {
	case <-reached:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("registered bot callback was not reached")
	}

	// 未注册的 bot 前缀路径：仍必须认证（401）。
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/bot/unregistered", nil)
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	assert.Equal(t, http.StatusUnauthorized, rr2.Code)
}
