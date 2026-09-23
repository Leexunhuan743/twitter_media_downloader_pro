package feishu

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chyroc/lark"
	"github.com/stretchr/testify/assert"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
)

// 回调路径（/api/v1/bot/feishu/callback）按精确匹配免 TMD 认证，唯一防线是
// 飞书侧的 verification token + X-Lark-Signature。缺配置时必须拒绝，而不是
// 落到 SDK 的无校验监听上（那会让任何能访问端口的人伪造事件触发 bot 命令）。
func TestBot_CallbackHandlerRequiresSecurityConfig(t *testing.T) {
	cases := []struct {
		name string
		cfg  *config.FeishuBotConfig
	}{
		{"missing both", &config.FeishuBotConfig{AppID: "cli_x", AppSecret: "s"}},
		{"missing verify token", &config.FeishuBotConfig{AppID: "cli_x", AppSecret: "s", EncryptKey: "ek"}},
		{"missing encrypt key", &config.FeishuBotConfig{AppID: "cli_x", AppSecret: "s", VerifyToken: "vt"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bot := &Bot{
				config: tc.cfg,
				cli:    lark.New(lark.WithAppCredential(tc.cfg.AppID, tc.cfg.AppSecret)),
			}
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/bot/feishu/callback", strings.NewReader(`{"schema":"2.0"}`))

			bot.CallbackHandler()(rec, req)

			assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
		})
	}
}

// 配齐校验字段后，未携带 X-Lark-Signature 的事件必须被拒绝（非 200），
// 而不是被当作合法事件处理 —— 这是免认证回调路径上真正的安全边界。
func TestBot_CallbackHandlerRejectsUnsignedEvent(t *testing.T) {
	cfg := &config.FeishuBotConfig{AppID: "cli_x", AppSecret: "s", VerifyToken: "vt", EncryptKey: "ek"}
	bot := &Bot{
		config: cfg,
		cli: lark.New(
			lark.WithAppCredential(cfg.AppID, cfg.AppSecret),
			lark.WithEventCallbackVerify(cfg.EncryptKey, cfg.VerifyToken),
		),
	}

	body := `{"schema":"2.0","header":{"event_type":"im.message.receive_v1","token":"vt"},"event":{"sender":{"sender_id":{"open_id":"ou_attacker"}},"message":{"message_type":"text","content":"{\"text\":\"/tasks\"}"}}}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bot/feishu/callback", strings.NewReader(body))

	bot.CallbackHandler()(rec, req)

	assert.NotEqual(t, http.StatusOK, rec.Code, "unsigned event must not be accepted")
}

func TestBot_IsAllowed(t *testing.T) {
	cfg := &config.FeishuBotConfig{AllowedUsers: nil}
	bot := &Bot{config: cfg}
	assert.True(t, bot.isAllowed("ou_xxx"))

	cfg.AllowedUsers = []string{"ou_alice", "ou_bob"}
	bot.config = cfg
	assert.True(t, bot.isAllowed("ou_alice"))
	assert.False(t, bot.isAllowed("ou_charlie"))
}

func TestBot_FormatTaskResult(t *testing.T) {
	t.Run("completed", func(t *testing.T) {
		task := &api.Task{
			ID: "task_test", Status: api.TaskStatusCompleted,
			Result: &api.TaskResult{Main: &api.TaskMainResult{Downloaded: 10, Failed: 1}},
		}
		result := api.FormatTaskResult(task, false)
		assert.Contains(t, result, "✅")
		assert.Contains(t, result, "Downloaded: 10")
	})

	t.Run("failed", func(t *testing.T) {
		task := &api.Task{
			ID: "task_fail", Status: api.TaskStatusFailed,
			Error: "something went wrong",
		}
		result := api.FormatTaskResult(task, false)
		assert.Contains(t, result, "❌")
		assert.Contains(t, result, "something went wrong")
	})
}

func TestBot_ParseDLArgs(t *testing.T) {
	t.Run("bare user", func(t *testing.T) {
		dlType, target := parseDLArgs("elonmusk")
		assert.Equal(t, "user", dlType)
		assert.Equal(t, "elonmusk", target)
	})
	t.Run("user type", func(t *testing.T) {
		dlType, target := parseDLArgs("user elonmusk")
		assert.Equal(t, "user", dlType)
		assert.Equal(t, "elonmusk", target)
	})
	t.Run("list type", func(t *testing.T) {
		dlType, target := parseDLArgs("list 12345")
		assert.Equal(t, "list", dlType)
		assert.Equal(t, "12345", target)
	})
	t.Run("foll type", func(t *testing.T) {
		dlType, target := parseDLArgs("foll elonmusk")
		assert.Equal(t, "foll", dlType)
		assert.Equal(t, "elonmusk", target)
	})
}

func TestBot_StatusConstants(t *testing.T) {
	assert.Equal(t, api.TaskStatus("completed"), api.TaskStatusCompleted)
	assert.Equal(t, api.TaskStatus("failed"), api.TaskStatusFailed)
}

func TestBot_CallbackHandlerBeforeStartReturnsUnavailable(t *testing.T) {
	bot := NewBot(&config.FeishuBotConfig{}, nil, nil, nil, nil)
	req := httptest.NewRequest(http.MethodPost, bot.CallbackPath(), nil)
	rec := httptest.NewRecorder()

	bot.CallbackHandler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
}
func TestBotStopIsIdempotent(t *testing.T) {
	bot := &Bot{stopCh: make(chan struct{})}

	assert.NotPanics(t, func() {
		bot.Stop()
		bot.Stop()
	})
}
