package wechat

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
)

// 二维码是登录凭据：必须解码成图片字节落盘（0600），且 app root 不可用时
// 不能静默写坏文件——这条路径决定了首次登录能否完成。
func TestWriteLoginQR(t *testing.T) {
	payload := []byte("\x89PNG\r\n\x1a\nfake-qr-bytes")

	t.Run("data URI", func(t *testing.T) {
		dir := t.TempDir()
		path, err := writeLoginQR(dir, "data:image/png;base64,"+base64.StdEncoding.EncodeToString(payload))
		require.NoError(t, err)
		assert.Equal(t, filepath.Join(dir, loginQRFileName), path)

		written, err := os.ReadFile(path)
		require.NoError(t, err)
		assert.Equal(t, payload, written)

		if runtime.GOOS != "windows" {
			info, err := os.Stat(path)
			require.NoError(t, err)
			assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())
		}
	})

	t.Run("bare base64 with surrounding whitespace", func(t *testing.T) {
		dir := t.TempDir()
		path, err := writeLoginQR(dir, "\n  "+base64.StdEncoding.EncodeToString(payload)+"  \n")
		require.NoError(t, err)

		written, err := os.ReadFile(path)
		require.NoError(t, err)
		assert.Equal(t, payload, written)
	})

	t.Run("invalid base64 writes nothing", func(t *testing.T) {
		dir := t.TempDir()
		_, err := writeLoginQR(dir, "not-base64!!")
		require.Error(t, err)
		_, statErr := os.Stat(filepath.Join(dir, loginQRFileName))
		assert.True(t, os.IsNotExist(statErr), "no file should be left behind")
	})

	t.Run("empty payload and empty app root", func(t *testing.T) {
		dir := t.TempDir()
		_, err := writeLoginQR(dir, "data:image/png;base64,")
		require.Error(t, err)

		_, err = writeLoginQR("", base64.StdEncoding.EncodeToString(payload))
		require.Error(t, err)
	})
}

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

// TestBotStopIsIdempotent 是各 provider 共享的 Stop 幂等契约的唯一样例：
// 每个 provider 的 Stop 都是 stopOnce.Do(close(stopCh)) + wg.Wait()，行为逐字
// 相同，因此不再在 telegram/discord/feishu 包里重复。放在 wechat 包是因为
// internal/bot/bot_test.go 属于父包，构造不出带私有 stopCh 的 provider。
func TestBotStopIsIdempotent(t *testing.T) {
	bot := &Bot{stopCh: make(chan struct{})}

	assert.NotPanics(t, func() {
		bot.Stop()
		bot.Stop()
	})
}
