package pushover

import (
	"fmt"
	"net/http"
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
		msg := api.FormatTaskResult(task, false)
		assert.Contains(t, title, "✅")
		assert.Contains(t, msg, "Downloaded: 10")
	})

	t.Run("failed", func(t *testing.T) {
		task := &api.Task{
			ID: "task_fail", Status: api.TaskStatusFailed,
			Error: "something went wrong",
		}
		title := "❌ TMD Download Failed"
		msg := api.FormatTaskResult(task, false)
		assert.Contains(t, title, "❌")
		assert.Contains(t, msg, "something went wrong")
	})
}

func TestBot_StatusConstants(t *testing.T) {
	assert.Equal(t, api.TaskStatus("completed"), api.TaskStatusCompleted)
	assert.Equal(t, api.TaskStatus("failed"), api.TaskStatusFailed)
}

// countingTransport 拦截推送请求：Pushover 端点硬编码，测试不能访问真实网络。
type countingTransport struct{ requests int }

func (c *countingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	c.requests++
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       http.NoBody,
		Header:     make(http.Header),
		Request:    req,
	}, nil
}

// 长期运行下 notifiedTasks 必须随任务离场释放，否则会随累计任务数单调增长。
// 模拟生产语义：每个 tasks 事件都是全部任务的完整快照，最旧批次随后被 24h 清理移出快照。
func TestBot_NotifyTaskChangesDropsTasksThatLeftSnapshot(t *testing.T) {
	transport := &countingTransport{}
	bot := NewBot(&config.PushoverBotConfig{Token: "test-token", User: "test-user"}, nil, nil)
	bot.client = &http.Client{Transport: transport}

	const batchSize = 10
	const batches = 20
	var live []*api.Task
	for batch := range batches {
		for i := range batchSize {
			live = append(live, &api.Task{
				ID:     fmt.Sprintf("task_%d_%d", batch, i),
				Status: api.TaskStatusCompleted,
			})
		}

		// 新终态任务只通知一次，即便它出现在之后每个快照里（完整快照会重复携带它）。
		bot.notifyTaskChanges(live)
		assert.Equal(t, (batch+1)*batchSize, transport.requests)

		// 24h 清理：最旧批次离开快照，对应记录必须同轮释放。
		live = live[batchSize:]
		bot.notifyTaskChanges(live)
		assert.Equal(t, len(live), len(bot.notifiedTasks))
	}

	// 全部任务清理完毕后不应残留任何记录。
	bot.notifyTaskChanges([]*api.Task{})
	assert.Empty(t, bot.notifiedTasks)
}

func TestBotStopIsIdempotent(t *testing.T) {
	bot := &Bot{stopCh: make(chan struct{})}

	assert.NotPanics(t, func() {
		bot.Stop()
		bot.Stop()
	})
}
