package api

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/bot"
)

func TestNewBotDownloadTask(t *testing.T) {
	tm := NewTaskManager(nil)

	req, err := bot.ParseDownloadCommand("list 12345 skip_profile=true")
	require.NoError(t, err)
	task := NewBotDownloadTask(tm, req)
	assert.Equal(t, TaskTypeListDownload, task.Type)
	data, ok := task.Data.(*ListDownloadTaskData)
	require.True(t, ok)
	assert.Equal(t, StringUint64(12345), data.ListID)
	assert.True(t, data.SkipProfile)

	req, err = bot.ParseDownloadCommand("foll elonmusk")
	require.NoError(t, err)
	assert.Equal(t, TaskTypeFollowingDownload, NewBotDownloadTask(tm, req).Type)

	req, err = bot.ParseDownloadCommand("elonmusk auto_follow=true")
	require.NoError(t, err)
	task = NewBotDownloadTask(tm, req)
	assert.Equal(t, TaskTypeUserDownload, task.Type)
	userData, ok := task.Data.(*UserDownloadTaskData)
	require.True(t, ok)
	assert.True(t, userData.AutoFollow)
}

func TestStartBotDownload(t *testing.T) {
	req, err := bot.ParseDownloadCommand("elonmusk")
	require.NoError(t, err)

	t.Run("queue unavailable", func(t *testing.T) {
		tm := NewTaskManager(nil)
		task, message := StartBotDownload(tm, req, nil)
		require.NotNil(t, task)
		assert.Equal(t, bot.EnqueueFailed, message)
		stored, ok := tm.GetTask(task.ID)
		require.True(t, ok)
		assert.Equal(t, TaskStatusFailed, stored.Status)
	})

	t.Run("enqueue error", func(t *testing.T) {
		tm := NewTaskManager(nil)
		task, message := StartBotDownload(tm, req, func(*Task) error { return errors.New("boom") })
		require.NotNil(t, task)
		assert.Contains(t, message, "boom")
	})

	t.Run("enqueued", func(t *testing.T) {
		tm := NewTaskManager(nil)
		var submitted *Task
		task, message := StartBotDownload(tm, req, func(got *Task) error {
			submitted = got
			return nil
		})
		require.NotNil(t, task)
		assert.Empty(t, message)
		assert.Same(t, task, submitted)
	})
}

func TestFormatTaskStatus(t *testing.T) {
	task := &Task{
		ID:       "task_123",
		Type:     TaskTypeUserDownload,
		Status:   TaskStatusRunning,
		Progress: &TaskProgress{Completed: 3, Total: 10, Failed: 1},
	}
	plain := FormatTaskStatus(task, false)
	assert.Contains(t, plain, "Task: task_123")
	assert.Contains(t, plain, "Progress: 3/10 (failed: 1)")

	marked := FormatTaskStatus(task, true)
	assert.Contains(t, marked, "\x60task_123\x60")

	task.Error = "boom"
	assert.Contains(t, FormatTaskStatus(task, false), "Error: boom")
}

func TestFormatTaskList(t *testing.T) {
	assert.Equal(t, bot.NoTasks, FormatTaskList(nil, 10, false))

	tasks := []*Task{
		{ID: "task_1", Type: TaskTypeUserDownload, Status: TaskStatusCompleted},
		{ID: "task_2", Type: TaskTypeListDownload, Status: TaskStatusFailed, Error: "boom"},
	}
	text := FormatTaskList(tasks, 1, false)
	assert.Contains(t, text, "task_1")
	assert.NotContains(t, text, "task_2")
	assert.Contains(t, text, "Recent Tasks:")

	text = FormatTaskList(tasks, 0, true)
	assert.Contains(t, text, "task_2")
	assert.Contains(t, text, "❌ boom")
}

func TestFormatCancelMessage(t *testing.T) {
	assert.Contains(t, FormatCancelMessage(CancelTaskResultCancelled, "task_1", true), "Cancelling")
	assert.Equal(t, bot.TaskNotCancellable, FormatCancelMessage(CancelTaskResultNotCancellable, "task_1", false))
	assert.Equal(t, bot.TaskNotFound, FormatCancelMessage(CancelTaskResultNotFound, "task_1", false))
}

func TestFormatTaskStats(t *testing.T) {
	text := FormatTaskStats(TaskStatsResponse{Queued: 1, Running: 2, Completed: 3, Failed: 4, Cancelled: 5, Total: 15})
	assert.Contains(t, text, "Queued: 1")
	assert.Contains(t, text, "Total: 15")
}
