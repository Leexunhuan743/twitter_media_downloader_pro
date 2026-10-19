package gotify

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
)

func TestBot_FormatTaskResult(t *testing.T) {
	t.Run("completed", func(t *testing.T) {
		task := &api.Task{
			ID: "task_test", Status: api.TaskStatusCompleted,
			Result: &api.TaskResult{Main: &api.TaskMainResult{Downloaded: 10, Failed: 1}},
		}
		title := "✅ TMD Download Complete"
		msg := api.FormatTaskResult(task, true)
		assert.Contains(t, title, "✅")
		assert.Contains(t, msg, "Downloaded: 10")
	})

	t.Run("failed", func(t *testing.T) {
		task := &api.Task{
			ID: "task_fail", Status: api.TaskStatusFailed,
			Error: "something went wrong",
		}
		title := "❌ TMD Download Failed"
		msg := api.FormatTaskResult(task, true)
		assert.Contains(t, title, "❌")
		assert.Contains(t, msg, "something went wrong")
	})
}

func TestBot_StatusConstants(t *testing.T) {
	assert.Equal(t, api.TaskStatus("completed"), api.TaskStatusCompleted)
	assert.Equal(t, api.TaskStatus("failed"), api.TaskStatusFailed)
}

func TestBot_NotifyTaskChangesDoesNotRepeatTerminalTask(t *testing.T) {
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		assert.Equal(t, "/message", r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	bot := NewBot(&config.GotifyBotConfig{
		ServerURL: server.URL,
		Token:     "test-token",
	}, nil, nil)
	task := &api.Task{
		ID:     "task_test",
		Status: api.TaskStatusCompleted,
		Result: &api.TaskResult{Main: &api.TaskMainResult{Downloaded: 1}},
	}

	bot.notifyTaskChanges([]*api.Task{task})
	bot.notifyTaskChanges([]*api.Task{task})

	assert.Equal(t, 1, requests)
}
func TestBot_NotifyTaskChangesPrunesExpiredTasks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	bot := NewBot(&config.GotifyBotConfig{ServerURL: server.URL, Token: "test-token"}, nil, nil)
	first := &api.Task{ID: "task_one", Status: api.TaskStatusCompleted}
	second := &api.Task{ID: "task_two", Status: api.TaskStatusCompleted}

	bot.notifyTaskChanges([]*api.Task{first})
	// 新快照里只有 second，first 已不在快照中，其标记应被清掉。
	bot.notifyTaskChanges([]*api.Task{second})

	bot.mu.Lock()
	tracked := len(bot.notifiedTasks)
	bot.mu.Unlock()
	assert.Equal(t, 1, tracked, "已从快照消失的任务不应一直占着通知去重表")
}

func TestBotStopIsIdempotent(t *testing.T) {
	bot := &Bot{stopCh: make(chan struct{})}

	assert.NotPanics(t, func() {
		bot.Stop()
		bot.Stop()
	})
}
