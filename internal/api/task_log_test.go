package api

import (
	"bytes"
	"context"
	"errors"
	"testing"

	log "github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/unkmonster/tmd/internal/service"
)

func captureTaskLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	originalOutput := log.StandardLogger().Out
	log.SetOutput(&buf)
	t.Cleanup(func() {
		log.SetOutput(originalOutput)
	})
	fn()
	return buf.String()
}

func TestTaskManagerLifecycleLogs(t *testing.T) {
	tm := NewTaskManager(nil)

	output := captureTaskLog(t, func() {
		task := tm.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "alice"})
		assert.True(t, tm.UpdateTaskStatus(task.ID, TaskStatusRunning))
		assert.True(t, tm.CompleteTask(task.ID, &TaskResult{Message: "done"}))
	})

	assert.Contains(t, output, "[task] Created")
	assert.Contains(t, output, "type=user_download")
	assert.Contains(t, output, "target=@alice")
	assert.Contains(t, output, "[task] Started")
	assert.Contains(t, output, "[task] Completed")
	assert.Contains(t, output, "dur=")
	assert.NotContains(t, output, "duration=")
	assert.NotContains(t, output, "[task] Completed task_id=")
}

func TestTaskManagerFailureLogRedactsError(t *testing.T) {
	tm := NewTaskManager(nil)

	output := captureTaskLog(t, func() {
		task := tm.CreateTask(TaskTypeJsonFileDownload, &JsonFileDownloadTaskData{Paths: []string{"secret.json"}})
		assert.True(t, tm.SetTaskError(task.ID, errors.New("download failed token=secret-token")))
	})

	assert.Contains(t, output, "[task] Failed")
	assert.Contains(t, output, "type=json_file_download")
	assert.NotContains(t, output, "secret-token")
	assert.Contains(t, output, "token=[redacted:")
}

func TestDownloadQueueEnqueueLog(t *testing.T) {
	server, db := setupTestServer(t)
	defer db.Close()

	output := captureTaskLog(t, func() {
		task := server.taskManager.CreateTask(TaskTypeListDownload, &ListDownloadTaskData{ListID: 123})
		server.downloadQueue.Enqueue(task, func(ctx context.Context, taskID string, reporter service.ProgressReporter) error {
			return nil
		})
	})

	assert.Contains(t, output, "[download-queue] Enqueued")
	assert.Contains(t, output, "type=list_download")
	assert.Contains(t, output, "target=list:123")
	assert.NotContains(t, output, "[download-queue] Enqueued task_id=")
}
