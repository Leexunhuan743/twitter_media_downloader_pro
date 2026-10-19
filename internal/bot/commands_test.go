package bot

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDownloadArgs(t *testing.T) {
	tests := []struct {
		name   string
		raw    string
		kind   Kind
		target string
	}{
		{"bare handle", "elonmusk", KindUser, "elonmusk"},
		{"explicit user", "user elonmusk", KindUser, "elonmusk"},
		{"explicit list", "list 12345", KindList, "12345"},
		{"explicit following", "foll elonmusk", KindFollowing, "elonmusk"},
		{"following alias", "following elonmusk", KindFollowing, "elonmusk"},
		{"tab separated", "list\t12345", KindList, "12345"},
		{"multiple spaces", "user    elonmusk", KindUser, "elonmusk"},
		{"unknown type word is a handle", "follower elonmusk", KindUser, "follower elonmusk"},
		{"type word only stays a handle", "list", KindUser, "list"},
		{"empty", "   ", KindUser, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			kind, target := ParseDownloadArgs(tt.raw)
			assert.Equal(t, tt.kind, kind)
			assert.Equal(t, tt.target, target)
		})
	}
}

func TestParseDownloadCommand(t *testing.T) {
	t.Run("flags are applied", func(t *testing.T) {
		req, err := ParseDownloadCommand("foll elonmusk auto_follow=true nr=false")
		require.NoError(t, err)
		assert.Equal(t, KindFollowing, req.Kind)
		assert.Equal(t, "elonmusk", req.Target)
		assert.True(t, req.Flags.AutoFollow)
		assert.False(t, req.Flags.NoRetry)
	})

	t.Run("list id is parsed", func(t *testing.T) {
		req, err := ParseDownloadCommand("list 12345 skip_profile=true")
		require.NoError(t, err)
		assert.Equal(t, KindList, req.Kind)
		assert.Equal(t, uint64(12345), req.ListID)
		assert.True(t, req.Flags.SkipProfile)
	})

	t.Run("tab separated list", func(t *testing.T) {
		req, err := ParseDownloadCommand("list\t12345")
		require.NoError(t, err)
		assert.Equal(t, KindList, req.Kind)
		assert.Equal(t, uint64(12345), req.ListID)
	})

	t.Run("missing target", func(t *testing.T) {
		_, err := ParseDownloadCommand("")
		require.ErrorIs(t, err, ErrEmptyTarget)
	})

	t.Run("type word alone is a user handle", func(t *testing.T) {
		req, err := ParseDownloadCommand("user")
		require.NoError(t, err)
		assert.Equal(t, KindUser, req.Kind)
		assert.Equal(t, "user", req.Target)
	})

	t.Run("invalid list id", func(t *testing.T) {
		_, err := ParseDownloadCommand("list abc")
		require.ErrorIs(t, err, ErrInvalidListID)
	})

	t.Run("zero list id", func(t *testing.T) {
		_, err := ParseDownloadCommand("list 0")
		require.ErrorIs(t, err, ErrInvalidListID)
	})
}

func TestKindFromString(t *testing.T) {
	kind, ok := KindFromString("")
	assert.True(t, ok)
	assert.Equal(t, KindUser, kind)

	kind, ok = KindFromString("Following")
	assert.True(t, ok)
	assert.Equal(t, KindFollowing, kind)

	_, ok = KindFromString("bogus")
	assert.False(t, ok)
}

func TestNewDownloadRequestRejectsUnknownKind(t *testing.T) {
	_, err := NewDownloadRequest(Kind("bogus"), "target", DownloadOptions{})
	require.ErrorIs(t, err, ErrInvalidKind)
}

func TestDownloadStartedMessage(t *testing.T) {
	assert.Equal(t, "📥 Download started for alice\nTask: \x60task_1\x60", DownloadStartedMessage("alice", "task_1", true))
	assert.Equal(t, "📥 Download started for alice\nTask: task_1", DownloadStartedMessage("alice", "task_1", false))
}

func TestTaskTracker(t *testing.T) {
	tracker := NewTaskTracker()

	tracker.Track("chat-1", "task-a")
	tracker.Track("chat-1", "task-b")
	tracker.Track("chat-2", "task-a")
	tracker.Track("", "task-a")
	tracker.Track("chat-3", "")

	assert.Equal(t, 2, tracker.Scopes())
	assert.Equal(t, 2, tracker.Pending("chat-1"))

	assert.ElementsMatch(t, []string{"chat-1", "chat-2"}, tracker.Drain("task-a"))
	assert.Equal(t, 0, tracker.Pending("chat-2"))
	assert.Equal(t, 1, tracker.Pending("chat-1"))

	assert.Nil(t, tracker.Drain("task-a"))
	assert.Nil(t, tracker.Drain(""))
}

func TestNilTaskTrackerIsSafe(t *testing.T) {
	var tracker *TaskTracker
	tracker.Track("chat", "task")
	assert.Nil(t, tracker.Drain("task"))
	assert.Equal(t, 0, tracker.Pending("chat"))
	assert.Equal(t, 0, tracker.Scopes())
}
