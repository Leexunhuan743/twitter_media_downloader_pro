package consolelog

import (
	"errors"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	log "github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHubKeepsLineLimit(t *testing.T) {
	hub := NewHub(3)

	hub.Add("line1")
	hub.Add("line2")
	hub.Add("line3")
	hub.Add("line4")

	assert.Equal(t, []string{"line2", "line3", "line4"}, hub.Snapshot())
}

func TestHubZeroValueIsUsable(t *testing.T) {
	var hub Hub
	ch, unsubscribe := hub.Subscribe()
	defer unsubscribe()

	hub.Add("line")

	assert.Equal(t, []string{"line"}, hub.Snapshot())
	select {
	case got := <-ch:
		assert.Equal(t, "line", got)
	case <-time.After(time.Second):
		t.Fatal("zero-value Hub subscriber did not receive line")
	}
}

func TestHubSubscribeReceivesNewLines(t *testing.T) {
	hub := NewHub(10)
	ch, unsubscribe := hub.Subscribe()
	defer unsubscribe()

	hub.Add("live line")

	assert.Eventually(t, func() bool {
		select {
		case got := <-ch:
			return got == "live line"
		default:
			return false
		}
	}, 200*time.Millisecond, 10*time.Millisecond, "expected subscribed log line")
}

func TestHubSubscribeUnsubscribeClosesChannel(t *testing.T) {
	hub := NewHub(10)
	ch, unsubscribe := hub.Subscribe()

	unsubscribe()

	assert.Eventually(t, func() bool {
		select {
		case _, ok := <-ch:
			return !ok
		default:
			return false
		}
	}, 200*time.Millisecond, 10*time.Millisecond, "expected unsubscribed log channel to be closed")
}

func TestHubCloseIsTerminalAndRetainsSnapshot(t *testing.T) {
	hub := NewHub(10)
	hub.Add("before close")
	active, _ := hub.Subscribe()

	hub.Close()
	hub.Add("after close")
	afterClose, _ := hub.Subscribe()

	assert.Equal(t, []string{"before close"}, hub.Snapshot())
	assert.ErrorIs(t, StartCapture(hub), ErrHubClosed)
	for name, ch := range map[string]<-chan string{"active": active, "after close": afterClose} {
		select {
		case _, ok := <-ch:
			assert.False(t, ok, "%s subscriber should be closed", name)
		case <-time.After(time.Second):
			t.Fatalf("%s subscriber remained open after Hub.Close", name)
		}
	}
}

func TestHubNormalizesLines(t *testing.T) {
	hub := NewHub(10)

	hub.Add(" \x1b[31mERRO[2026] failed\x1b[0m ")
	hub.Add("")

	assert.Equal(t, []string{"ERRO[2026] failed"}, hub.Snapshot())
}

func TestHubSanitizesPublicLogLines(t *testing.T) {
	hub := NewHub(10)
	hub.Add("\x1b]8;;https://example.invalid\afailure\x1b]8;;\a token=plain-secret")

	lines := hub.Snapshot()
	require.Len(t, lines, 1)
	assert.NotContains(t, lines[0], "\x1b")
	assert.NotContains(t, lines[0], "plain-secret")
	assert.Contains(t, lines[0], "[redacted:")
}

func TestHubUsesFixedRingBuffer(t *testing.T) {
	hub := NewHub(3)

	for i := 0; i < 10; i++ {
		hub.Add(string(rune('a' + i)))
	}

	assert.Equal(t, 3, len(hub.lines))
	assert.Equal(t, 3, cap(hub.lines))
	assert.Equal(t, 3, hub.count)
	assert.Equal(t, []string{"h", "i", "j"}, hub.Snapshot())
}

func TestHubRemovesSlowSubscriberOnOverflow(t *testing.T) {
	hub := NewHub(10)
	_, _ = hub.Subscribe()

	for i := 0; i < subscriberBuffer*2; i++ {
		hub.Add("line")
	}

	assert.Eventually(t, func() bool {
		hub.mu.Lock()
		defer hub.mu.Unlock()
		return len(hub.subscribers) == 0
	}, 200*time.Millisecond, 10*time.Millisecond, "Slow log subscriber should be removed after queue overflow")
}

func TestLogSubscriberConcurrentOverflowAndCloseCompletes(t *testing.T) {
	const iterations = 500
	start := make(chan struct{})
	var workers sync.WaitGroup
	workers.Add(iterations * 2)

	for range iterations {
		subscriber := newLogSubscriber()
		for range subscriberBuffer {
			require.Equal(t, logSendQueued, subscriber.send("queued"))
		}

		go func() {
			defer workers.Done()
			<-start
			subscriber.send("overflow")
		}()
		go func() {
			defer workers.Done()
			<-start
			subscriber.close()
		}()
	}

	close(start)
	allDone := make(chan struct{})
	go func() {
		workers.Wait()
		close(allDone)
	}()
	select {
	case <-allDone:
	case <-time.After(2 * time.Second):
		t.Fatal("subscriber overflow and close deadlocked")
	}
}

type chunkedReader struct {
	chunks [][]byte
	index  int
}

func (r *chunkedReader) Read(p []byte) (int, error) {
	if r.index >= len(r.chunks) {
		return 0, io.EOF
	}

	chunk := r.chunks[r.index]
	r.index++
	n := copy(p, chunk)
	return n, nil
}

func TestCapturePipe_ReassemblesLinesAcrossChunks(t *testing.T) {
	hub := NewHub(10)
	output, err := os.CreateTemp("", "capture-pipe-output")
	require.NoError(t, err)
	defer os.Remove(output.Name())
	defer output.Close()

	reader := &chunkedReader{
		chunks: [][]byte{
			[]byte("line1\r"),
			[]byte("\nline"),
			[]byte("2\nline3"),
		},
	}

	capturePipe(reader, output, hub)

	_, err = output.Seek(0, 0)
	require.NoError(t, err)

	data, err := io.ReadAll(output)
	require.NoError(t, err)

	assert.Equal(t, "line1\r\nline2\nline3", string(data))
	assert.Equal(t, []string{"line1", "line2", "line3"}, hub.Snapshot())
}

func TestCapturePipeBoundsLongLinesAndRecoversAtNewline(t *testing.T) {
	const maxLineBytes = 16 << 10
	hub := NewHub(10)
	reader := strings.NewReader(strings.Repeat("a", maxLineBytes+1024) + "\nnext\n")
	output, err := os.CreateTemp("", "capture-pipe-long-line")
	require.NoError(t, err)
	defer os.Remove(output.Name())
	defer output.Close()

	capturePipe(reader, output, hub)

	lines := hub.Snapshot()
	require.Len(t, lines, 2)
	assert.LessOrEqual(t, len(lines[0]), maxLineBytes)
	assert.True(t, strings.HasSuffix(lines[0], " [truncated]"))
	assert.Equal(t, "next", lines[1])
}

func TestHubBoundsStoredLinesAtUTF8Boundary(t *testing.T) {
	hub := NewHub(10)
	hub.Add(strings.Repeat("界", maxStoredLineBytes))

	lines := hub.Snapshot()
	require.Len(t, lines, 1)
	assert.LessOrEqual(t, len(lines[0]), maxStoredLineBytes)
	assert.True(t, utf8.ValidString(lines[0]))
	assert.True(t, strings.HasSuffix(lines[0], truncatedLineSuffix))
}

func TestStartCaptureRetriesAfterFailure(t *testing.T) {
	StopCapture()
	captureMu.Lock()
	startCaptureFn = startCaptureSession
	captureMu.Unlock()
	t.Cleanup(func() {
		StopCapture()
		captureMu.Lock()
		startCaptureFn = startCaptureSession
		captureMu.Unlock()
	})

	hub := NewHub(10)
	calls := 0
	startCaptureFn = func(h *Hub) (*captureSession, error) {
		calls++
		if calls == 1 {
			return nil, errors.New("temporary start failure")
		}
		return &captureSession{
			hub:            h,
			originalStdout: os.Stdout,
			originalStderr: os.Stderr,
		}, nil
	}

	err := StartCapture(hub)
	require.EqualError(t, err, "temporary start failure")

	err = StartCapture(hub)
	require.NoError(t, err)
	assert.Equal(t, 2, calls)
}

func TestStartCaptureIsIdempotentAfterSuccess(t *testing.T) {
	StopCapture()
	captureMu.Lock()
	startCaptureFn = startCaptureSession
	captureMu.Unlock()
	t.Cleanup(func() {
		StopCapture()
		captureMu.Lock()
		startCaptureFn = startCaptureSession
		captureMu.Unlock()
	})

	hub := NewHub(10)
	calls := 0
	startCaptureFn = func(h *Hub) (*captureSession, error) {
		calls++
		return &captureSession{
			hub:            h,
			originalStdout: os.Stdout,
			originalStderr: os.Stderr,
		}, nil
	}

	require.NoError(t, StartCapture(hub))
	require.NoError(t, StartCapture(hub))
	assert.Equal(t, 1, calls)
}

func TestStartCaptureRejectsDifferentHub(t *testing.T) {
	StopCapture()
	captureMu.Lock()
	startCaptureFn = startCaptureSession
	captureMu.Unlock()
	t.Cleanup(func() {
		StopCapture()
		captureMu.Lock()
		startCaptureFn = startCaptureSession
		captureMu.Unlock()
	})

	calls := 0
	startCaptureFn = func(h *Hub) (*captureSession, error) {
		calls++
		return &captureSession{
			hub:            h,
			originalStdout: os.Stdout,
			originalStderr: os.Stderr,
		}, nil
	}

	require.NoError(t, StartCapture(NewHub(10)))
	err := StartCapture(NewHub(10))
	assert.ErrorIs(t, err, ErrCaptureAlreadyActive)
	assert.Equal(t, 1, calls)
}

func TestHubCloseStopsOnlyOwnedCapture(t *testing.T) {
	StopCapture()
	captureMu.Lock()
	startCaptureFn = startCaptureSession
	captureMu.Unlock()
	t.Cleanup(func() {
		StopCapture()
		captureMu.Lock()
		startCaptureFn = startCaptureSession
		captureMu.Unlock()
	})

	owner := NewHub(10)
	other := NewHub(10)
	startCaptureFn = func(h *Hub) (*captureSession, error) {
		return &captureSession{
			hub:            h,
			originalStdout: os.Stdout,
			originalStderr: os.Stderr,
		}, nil
	}
	require.NoError(t, StartCapture(owner))

	other.Close()
	captureMu.Lock()
	activeAfterOtherClose := activeCapture
	captureMu.Unlock()
	assert.NotNil(t, activeAfterOtherClose)

	owner.Close()
	captureMu.Lock()
	activeAfterOwnerClose := activeCapture
	captureMu.Unlock()
	assert.Nil(t, activeAfterOwnerClose)
}

func TestStopCaptureRestoresStandardLogOutput(t *testing.T) {
	StopCapture()

	originalLogOut := log.StandardLogger().Out
	originalStderr := os.Stderr
	t.Cleanup(func() {
		log.SetOutput(originalLogOut)
		StopCapture()
	})

	hub := NewHub(10)
	require.NoError(t, StartCapture(hub))
	log.SetOutput(os.Stderr)
	require.NotEqual(t, originalStderr, log.StandardLogger().Out)

	StopCapture()

	assert.Equal(t, originalStderr, os.Stderr)
	assert.Equal(t, originalStderr, log.StandardLogger().Out)
}
