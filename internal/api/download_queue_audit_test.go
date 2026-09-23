package api

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/service"
)

// P1-2 修复回归：队列关闭后 Enqueue 必须返回明确错误（而不是静默丢弃），
// 使调用方能把拒绝的任务转为终态而非永久 queued。
func TestDownloadQueueEnqueueAfterCloseReturnsError(t *testing.T) {
	queue := &DownloadQueue{
		detached: make(map[string]*detachedRun),
	}
	queue.mu.Lock()
	queue.closed = true
	queue.mu.Unlock()

	err := queue.Enqueue(&Task{ID: "task_x", Status: TaskStatusQueued}, func(ctx context.Context, taskID string, reporter service.ProgressReporter) error {
		return nil
	})

	assert.Error(t, err)
	assert.ErrorIs(t, err, ErrQueueClosed)
}

// P1-2 修复回归：enqueueTask 在队列关闭时把任务转为 Failed 终态并返回错误，
// 调用方（HTTP/Bot/Scheduler）不会再收到"已排队"但永不执行的假成功。
func TestEnqueueTaskRejectsWhenQueueClosed(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	// 注入无 worker 的 closed 队列：Enqueue 在 closed 时直接拒绝，无需 worker。
	server.downloadQueue = &DownloadQueue{closed: true, detached: make(map[string]*detachedRun)}

	task := server.taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "someone"})
	err := server.EnqueueTask(task)

	assert.Error(t, err)
	got, ok := server.taskManager.GetTask(task.ID)
	require.True(t, ok)
	assert.Equal(t, TaskStatusFailed, got.Status, "rejected task must be terminal, not stuck queued")
	assert.NotEmpty(t, got.Error)
}

// P1-2 修复回归：buildAndEnqueueTask 入队失败时写入 503 并返回 false，
// HTTP 调用方不再得到 202 假成功。
func TestBuildAndEnqueueTaskWrites503WhenQueueClosed(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	server.downloadQueue = &DownloadQueue{closed: true, detached: make(map[string]*detachedRun)}

	task := server.taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "someone"})

	// 用最小 recorder + 请求构造（buildAndEnqueueTask 只写响应，不读请求）。
	w := &stubResponseWriter{header: make(map[string][]string)}
	ok := server.buildAndEnqueueTask(w, task)

	assert.False(t, ok)
	assert.Equal(t, 503, w.statusCode)
	got, exists := server.taskManager.GetTask(task.ID)
	require.True(t, exists)
	assert.Equal(t, TaskStatusFailed, got.Status)
}

func TestBuildAndEnqueueTaskMarksMapperFailureFailed(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	// A non-nil queue makes EnqueueTask reach the mapper before admission. No
	// worker is necessary because the unsupported task fails during mapping.
	server.downloadQueue = &DownloadQueue{detached: make(map[string]*detachedRun)}

	task := server.taskManager.CreateTask(TaskType("unsupported"), nil)
	w := &stubResponseWriter{header: make(map[string][]string)}

	ok := server.buildAndEnqueueTask(w, task)

	assert.False(t, ok)
	assert.Equal(t, http.StatusInternalServerError, w.statusCode)
	got, exists := server.taskManager.GetTask(task.ID)
	require.True(t, exists)
	assert.Equal(t, TaskStatusFailed, got.Status)
	assert.NotEmpty(t, got.Error)
}

// stubResponseWriter 最小 http.ResponseWriter 实现（测试用）。
type stubResponseWriter struct {
	header     http.Header
	statusCode int
	body       []byte
}

func (w *stubResponseWriter) Header() http.Header  { return w.header }
func (w *stubResponseWriter) WriteHeader(code int) { w.statusCode = code }
func (w *stubResponseWriter) Write(b []byte) (int, error) {
	w.body = append(w.body, b...)
	return len(b), nil
}
