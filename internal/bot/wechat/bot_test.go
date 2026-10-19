package wechat

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/unkmonster/tmd/internal/api"
	botpkg "github.com/unkmonster/tmd/internal/bot"
	"github.com/unkmonster/tmd/internal/config"
)

func TestBot_IsAllowed(t *testing.T) {
	cfg := &config.WeChatBotConfig{AllowedUsers: nil}
	bot := &Bot{config: cfg}
	assert.True(t, bot.isAllowed("user@im.wechat"))

	cfg.AllowedUsers = []string{"alice@im.wechat", "bob@im.wechat"}
	bot.config = cfg
	assert.True(t, bot.isAllowed("alice@im.wechat"))
	assert.False(t, bot.isAllowed("charlie@im.wechat"))
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

func TestBot_NotifyTaskChanges(t *testing.T) {
	sut := &Bot{
		userTokens: make(map[string]string),
		tracker:    botpkg.NewTaskTracker(),
		stopCh:     make(chan struct{}),
	}

	// completed task, no matching user → no send, no crash
	sut.notifyTaskChanges([]*api.Task{
		{ID: "task_orphan", Status: api.TaskStatusCompleted,
			Result: &api.TaskResult{Main: &api.TaskMainResult{Downloaded: 1}}},
	})

	// running task → should NOT trigger cleanup or send
	sut.tracker.Track("user1", "task_run")
	sut.notifyTaskChanges([]*api.Task{
		{ID: "task_run", Status: api.TaskStatusRunning},
	})
	assert.Equal(t, 1, sut.tracker.Pending("user1"),
		"running tasks should not be cleaned up")

	// cancelled task → no notification, but the tracker entry must be released
	sut.tracker.Track("user2", "task_cancel")
	sut.notifyTaskChanges([]*api.Task{
		{ID: "task_cancel", Status: api.TaskStatusCancelled},
	})
	assert.Equal(t, 0, sut.tracker.Pending("user2"),
		"cancelled tasks should be dropped from the tracker")

	// nil/empty data → no crash
	sut.notifyTaskChanges(nil)
	sut.notifyTaskChanges("bad type")
}
func TestBotStopIsIdempotent(t *testing.T) {
	bot := &Bot{stopCh: make(chan struct{})}

	assert.NotPanics(t, func() {
		bot.Stop()
		bot.Stop()
	})
}
