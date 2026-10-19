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
		// 入队失败的任务必须落到 failed，不能在任务列表里一直排着。
		stored, ok := tm.GetTask(task.ID)
		require.True(t, ok)
		assert.Equal(t, TaskStatusFailed, stored.Status)
		assert.Contains(t, stored.Error, "boom")
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

func TestNotifyIfTerminal(t *testing.T) {
	req, err := bot.ParseDownloadCommand("elonmusk")
	require.NoError(t, err)

	t.Run("terminal task is notified immediately", func(t *testing.T) {
		tm := NewTaskManager(nil)
		task, _ := StartBotDownload(tm, req, func(*Task) error { return errors.New("boom") })
		require.Equal(t, TaskStatusFailed, mustTask(t, tm, task.ID).Status)

		var notified [][]*Task
		NotifyIfTerminal(tm, task.ID, func(tasks []*Task) { notified = append(notified, tasks) })
		require.Len(t, notified, 1)
		assert.Equal(t, task.ID, notified[0][0].ID)
	})

	t.Run("queued task is not notified", func(t *testing.T) {
		tm := NewTaskManager(nil)
		task, message := StartBotDownload(tm, req, func(*Task) error { return nil })
		require.Empty(t, message)

		called := false
		NotifyIfTerminal(tm, task.ID, func([]*Task) { called = true })
		assert.False(t, called)
	})

	t.Run("missing task or nil args are ignored", func(t *testing.T) {
		tm := NewTaskManager(nil)
		NotifyIfTerminal(tm, "nope", func([]*Task) { t.Fatal("should not be called") })
		NotifyIfTerminal(nil, "x", func([]*Task) { t.Fatal("should not be called") })
		NotifyIfTerminal(tm, "", func([]*Task) { t.Fatal("should not be called") })
	})
}

func mustTask(t *testing.T, tm *TaskManager, id string) *Task {
	t.Helper()
	task, ok := tm.GetTask(id)
	require.True(t, ok)
	return task
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
