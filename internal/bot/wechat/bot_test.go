package wechat

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/unkmonster/tmd/internal/api"
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
	bot := &Bot{
		userTokens: make(map[string]string),
		userTasks:  make(map[string]map[string]struct{}),
		stopCh:     make(chan struct{}),
	}

	// completed task, no matching user → no send, no crash
	bot.notifyTaskChanges([]*api.Task{
		{ID: "task_orphan", Status: api.TaskStatusCompleted,
			Result: &api.TaskResult{Main: &api.TaskMainResult{Downloaded: 1}}},
	})

	// running task → should NOT trigger cleanup or send
	bot.userTasks["user1"] = map[string]struct{}{"task_run": {}}
	bot.notifyTaskChanges([]*api.Task{
		{ID: "task_run", Status: api.TaskStatusRunning},
	})
	assert.NotEmpty(t, bot.userTasks["user1"],
		"running tasks should not be cleaned up")

	// nil/empty data → no crash
	bot.notifyTaskChanges(nil)
	bot.notifyTaskChanges("bad type")
}
