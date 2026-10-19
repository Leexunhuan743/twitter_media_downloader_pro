package feishu

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
	"github.com/unkmonster/tmd/internal/config"
)

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

func TestBot_ParseDownloadCommand(t *testing.T) {
	t.Run("bare user", func(t *testing.T) {
		req, err := bot.ParseDownloadCommand("elonmusk")
		assert.NoError(t, err)
		assert.Equal(t, bot.KindUser, req.Kind)
		assert.Equal(t, "elonmusk", req.Target)
	})
	t.Run("explicit list", func(t *testing.T) {
		req, err := bot.ParseDownloadCommand("list 12345")
		assert.NoError(t, err)
		assert.Equal(t, bot.KindList, req.Kind)
		assert.Equal(t, uint64(12345), req.ListID)
	})
	t.Run("following alias", func(t *testing.T) {
		req, err := bot.ParseDownloadCommand("following elonmusk")
		assert.NoError(t, err)
		assert.Equal(t, bot.KindFollowing, req.Kind)
		assert.Equal(t, "elonmusk", req.Target)
	})
	t.Run("invalid list id", func(t *testing.T) {
		_, err := bot.ParseDownloadCommand("list abc")
		assert.ErrorIs(t, err, bot.ErrInvalidListID)
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
