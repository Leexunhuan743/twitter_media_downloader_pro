package api

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateTaskWithOptionsPublishesEntryIDInFirstSnapshot(t *testing.T) {
	eventBus := NewEventBus()
	tm := NewTaskManager(eventBus)
	t.Cleanup(tm.Close)
	t.Cleanup(eventBus.Close)

	events, unsubscribe := eventBus.Subscribe()
	t.Cleanup(unsubscribe)

	task := tm.CreateTaskWithOptions(TaskTypeListDownload, &ListDownloadTaskData{ListID: 123}, TaskCreateOptions{EntryID: "entry-42"})

	select {
	case event := <-events:
		require.Equal(t, "tasks", event.Event)
		var published []*Task
		require.NoError(t, json.Unmarshal(event.Raw, &published))
		require.Len(t, published, 1)
		assert.Equal(t, task.ID, published[0].ID)
		assert.Equal(t, "entry-42", published[0].EntryID)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for the first task snapshot")
	}

	snap := tm.GetAllTasks()
	require.Len(t, snap, 1)
	assert.Equal(t, "entry-42", snap[0].EntryID)
}

func TestRetryTaskPreservesCreationMetadata(t *testing.T) {
	tm := NewTaskManager(nil)
	t.Cleanup(tm.Close)

	task := tm.CreateTaskWithOptions(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "alice"}, TaskCreateOptions{EntryID: "entry-42"})
	require.True(t, tm.SetTaskError(task.ID, assert.AnError))

	retry, result := tm.RetryTask(task.ID)

	require.Equal(t, RetryTaskResultSuccess, result)
	assert.Equal(t, "entry-42", retry.EntryID)
}
