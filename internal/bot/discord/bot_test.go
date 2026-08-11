package discord

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
)

type deadlineRecordingConn struct {
	net.Conn
	deadlines []time.Time
}

func (c *deadlineRecordingConn) SetDeadline(deadline time.Time) error {
	c.deadlines = append(c.deadlines, deadline)
	return c.Conn.SetDeadline(deadline)
}

func TestApplyGatewayStartupDeadlineRestoresLongLivedSettings(t *testing.T) {
	session, err := discordgo.New("Bot token")
	require.NoError(t, err)
	session.Client.Timeout = 2 * time.Second
	session.Dialer.HandshakeTimeout = 3 * time.Second
	dialCalls := 0
	var recorded *deadlineRecordingConn
	var peer net.Conn
	session.Dialer.NetDialContext = func(context.Context, string, string) (net.Conn, error) {
		dialCalls++
		client, server := net.Pipe()
		peer = server
		recorded = &deadlineRecordingConn{Conn: client}
		return recorded, nil
	}

	restore, interrupt := applyGatewayStartupDeadline(session, 50*time.Millisecond)
	conn, err := session.Dialer.NetDialContext(context.Background(), "tcp", "example.invalid:443")
	require.NoError(t, err)
	defer conn.Close()
	defer peer.Close()
	assert.Equal(t, 50*time.Millisecond, session.Client.Timeout)
	assert.Equal(t, 50*time.Millisecond, session.Dialer.HandshakeTimeout)
	require.Len(t, recorded.deadlines, 1)
	assert.False(t, recorded.deadlines[0].IsZero())
	// interrupt 使已跟踪连接立即超时（在 Open 卡死场景中打断无界读）。
	require.NotNil(t, interrupt)

	restore()

	assert.Equal(t, 2*time.Second, session.Client.Timeout)
	assert.Equal(t, 3*time.Second, session.Dialer.HandshakeTimeout)
	require.Len(t, recorded.deadlines, 2)
	assert.True(t, recorded.deadlines[1].IsZero())
	second, err := session.Dialer.NetDialContext(context.Background(), "tcp", "example.invalid:443")
	require.NoError(t, err)
	second.Close()
	peer.Close()
	assert.Equal(t, 2, dialCalls)
}

func TestBot_IsAllowed(t *testing.T) {
	cfg := &config.DiscordBotConfig{AllowedUsers: nil}
	bot := &Bot{config: cfg}
	assert.True(t, bot.isAllowed("12345"))

	cfg.AllowedUsers = []string{"100", "200"}
	bot.config = cfg
	assert.True(t, bot.isAllowed("100"))
	assert.False(t, bot.isAllowed("300"))
}

func TestBot_FormatTaskResult(t *testing.T) {
	t.Run("completed", func(t *testing.T) {
		task := &api.Task{
			ID: "task_test", Status: api.TaskStatusCompleted,
			Result: &api.TaskResult{Main: &api.TaskMainResult{Downloaded: 10, Failed: 1}},
		}
		result := api.FormatTaskResult(task, true)
		assert.Contains(t, result, "✅")
		assert.Contains(t, result, "Downloaded: 10")
	})

	t.Run("failed", func(t *testing.T) {
		task := &api.Task{
			ID: "task_fail", Status: api.TaskStatusFailed,
			Error: "something went wrong",
		}
		result := api.FormatTaskResult(task, true)
		assert.Contains(t, result, "❌")
		assert.Contains(t, result, "something went wrong")
	})

	t.Run("no result", func(t *testing.T) {
		task := &api.Task{
			ID: "task_none", Status: api.TaskStatusCompleted,
		}
		result := api.FormatTaskResult(task, true)
		assert.Contains(t, result, "✅")
	})
}

func TestBot_EscapeDiscord(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello", "hello"},
		{"err: something_bad", `err: something\_bad`},
		{"error: *panic*", `error: \*panic\*`},
		{"backtick`here", "backtick\\`here"},
		{"~strike~", "\\~strike\\~"},
		{"|pipe|", "\\|pipe\\|"},
		{">quote", "\\>quote"},
	}
	for _, tt := range tests {
		got := escapeDiscord(tt.input)
		assert.Equal(t, tt.expected, got, "escapeDiscord(%q)", tt.input)
	}
}

func TestBot_StatusConstants(t *testing.T) {
	assert.Equal(t, api.TaskStatus("completed"), api.TaskStatusCompleted)
	assert.Equal(t, api.TaskStatus("failed"), api.TaskStatusFailed)
	assert.Equal(t, api.TaskStatus("cancelled"), api.TaskStatusCancelled)
}
func TestBotStopIsIdempotent(t *testing.T) {
	bot := &Bot{stopCh: make(chan struct{})}

	assert.NotPanics(t, func() {
		bot.Stop()
		bot.Stop()
	})
}
