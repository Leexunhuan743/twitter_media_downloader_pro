package consolelog

import (
	"bytes"
	"errors"
	"io"
	"os"
	"strings"
	"sync"
	"unicode/utf8"

	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"
)

const (
	// DefaultLimit is the number of recent lines retained by a default Hub.
	DefaultLimit = 5000

	subscriberBuffer     = 100
	maxStoredLineBytes   = 16 << 10
	truncatedLineSuffix  = " [truncated]"
	maxCapturedLineBytes = maxStoredLineBytes + 1
)

// ErrCaptureAlreadyActive indicates that another Hub owns stdout/stderr capture.
var ErrCaptureAlreadyActive = errors.New("consolelog: stdout/stderr capture is already active for another hub")

// ErrHubClosed indicates that capture was requested for a terminal Hub.
var ErrHubClosed = errors.New("consolelog: hub is closed")

var errNilCaptureSession = errors.New("consolelog: capture starter returned a nil session")

var (
	defaultHub = NewHub(DefaultLimit)

	captureMu      sync.Mutex
	activeCapture  *captureSession
	startCaptureFn = startCaptureSession
)

// captureSession owns the redirected stdout/stderr pipes and workers for one
// installed capture.
type captureSession struct {
	hub            *Hub
	originalStdout *os.File
	originalStderr *os.File
	stdoutReader   *os.File
	stdoutWriter   *os.File
	stderrReader   *os.File
	stderrWriter   *os.File
	wg             sync.WaitGroup
}

// Hub retains recent console lines and broadcasts new lines to subscribers.
// Its zero value is ready for use.
type Hub struct {
	mu          sync.RWMutex
	lines       []string
	start       int
	count       int
	limit       int
	subscribers map[*logSubscriber]struct{}
	closed      bool
}

type logSubscriber struct {
	mu     sync.Mutex
	ch     chan string
	closed bool
}

func newLogSubscriber() *logSubscriber {
	return &logSubscriber{
		ch: make(chan string, subscriberBuffer),
	}
}

type logSendResult int

const (
	logSendQueued logSendResult = iota
	logSendClosed
	logSendOverflow
)

func (s *logSubscriber) send(line string) logSendResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return logSendClosed
	}
	select {
	case s.ch <- line:
		return logSendQueued
	default:
		s.closed = true
		close(s.ch)
		return logSendOverflow
	}
}

func (s *logSubscriber) close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	close(s.ch)
}

func (h *Hub) removeSubscribers(subscribers []*logSubscriber) {
	h.mu.Lock()
	for _, sub := range subscribers {
		delete(h.subscribers, sub)
	}
	h.mu.Unlock()
}

// DefaultHub returns the process-wide console Hub.
func DefaultHub() *Hub {
	return defaultHub
}

// NewHub creates a Hub retaining at most limit recent lines.
func NewHub(limit int) *Hub {
	if limit <= 0 {
		limit = DefaultLimit
	}

	return &Hub{
		lines:       make([]string, limit),
		limit:       limit,
		subscribers: make(map[*logSubscriber]struct{}),
	}
}

func (h *Hub) initializeLocked() {
	if h.limit <= 0 {
		h.limit = DefaultLimit
	}
	if len(h.lines) != h.limit {
		h.lines = make([]string, h.limit)
		h.start = 0
		h.count = 0
	}
	if h.subscribers == nil {
		h.subscribers = make(map[*logSubscriber]struct{})
	}
}

// Add sanitizes, bounds, stores, and broadcasts a non-empty log line.
func (h *Hub) Add(line string) {
	line = strings.TrimSpace(logging.SanitizeLogText(line))
	if line == "" {
		return
	}
	line = truncateStoredLine(line)

	h.mu.Lock()
	h.initializeLocked()
	if h.closed {
		h.mu.Unlock()
		return
	}

	if h.count < h.limit {
		idx := (h.start + h.count) % h.limit
		h.lines[idx] = line
		h.count++
	} else {
		h.lines[h.start] = line
		h.start = (h.start + 1) % h.limit
	}

	subscribers := make([]*logSubscriber, 0, len(h.subscribers))
	for sub := range h.subscribers {
		subscribers = append(subscribers, sub)
	}
	h.mu.Unlock()

	var overflowed []*logSubscriber
	for _, sub := range subscribers {
		switch sub.send(line) {
		case logSendOverflow:
			overflowed = append(overflowed, sub)
		}
	}

	if len(overflowed) > 0 {
		h.removeSubscribers(overflowed)
		log.Warnf("[consolelog] Slow subscribers closed count=%d reason=queue_overflow", len(overflowed))
	}
}

func truncateStoredLine(line string) string {
	if len(line) <= maxStoredLineBytes {
		return line
	}

	end := maxStoredLineBytes - len(truncatedLineSuffix)
	for end > 0 && !utf8.RuneStart(line[end]) {
		end--
	}
	return strings.TrimRight(line[:end], " \t\r\n") + truncatedLineSuffix
}

// Snapshot returns an oldest-to-newest copy of the retained lines.
func (h *Hub) Snapshot() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	lines := make([]string, h.count)
	if h.count == 0 {
		return lines
	}

	if h.start+h.count <= h.limit {
		copy(lines, h.lines[h.start:h.start+h.count])
		return lines
	}

	n := copy(lines, h.lines[h.start:])
	copy(lines[n:], h.lines[:(h.start+h.count)%h.limit])
	return lines
}

// Close transitions the Hub to a terminal state, closes its subscribers, and
// stops capture only when this Hub owns the active session. Retained lines
// remain available through Snapshot.
func (h *Hub) Close() {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		stopCaptureForHub(h)
		return
	}
	h.closed = true
	subscribers := make([]*logSubscriber, 0, len(h.subscribers))
	for sub := range h.subscribers {
		subscribers = append(subscribers, sub)
	}
	h.subscribers = make(map[*logSubscriber]struct{})
	h.mu.Unlock()

	for _, sub := range subscribers {
		sub.close()
	}
	stopCaptureForHub(h)
}

// Subscribe returns future log lines and an idempotent unsubscribe function.
func (h *Hub) Subscribe() (<-chan string, func()) {
	sub := newLogSubscriber()

	h.mu.Lock()
	h.initializeLocked()
	if h.closed {
		h.mu.Unlock()
		sub.close()
		return sub.ch, func() {}
	}
	h.subscribers[sub] = struct{}{}
	h.mu.Unlock()

	return sub.ch, func() {
		h.mu.Lock()
		_, ok := h.subscribers[sub]
		if ok {
			delete(h.subscribers, sub)
		}
		h.mu.Unlock()

		if ok {
			sub.close()
		}
	}
}

// StartCapture redirects stdout and stderr into h. Repeated calls for the same
// Hub are idempotent; a different Hub cannot replace an active owner.
func StartCapture(h *Hub) error {
	if h == nil {
		h = DefaultHub()
	}

	captureMu.Lock()
	defer captureMu.Unlock()
	h.mu.RLock()
	closed := h.closed
	h.mu.RUnlock()
	if closed {
		return ErrHubClosed
	}

	if activeCapture != nil {
		if activeCapture.hub == h {
			return nil
		}
		return ErrCaptureAlreadyActive
	}

	session, err := startCaptureFn(h)
	if err != nil {
		return err
	}
	if session == nil {
		return errNilCaptureSession
	}

	session.hub = h
	activeCapture = session
	return nil
}

// StopCapture stops the active stdout/stderr capture session and restores
// the original stdout/stderr. It is safe to call multiple times (no-op
// when no capture is active).
func StopCapture() {
	captureMu.Lock()
	defer captureMu.Unlock()
	stopCaptureLocked()
}

func stopCaptureForHub(h *Hub) {
	captureMu.Lock()
	defer captureMu.Unlock()
	if activeCapture == nil || activeCapture.hub != h {
		return
	}
	stopCaptureLocked()
}

func startCaptureSession(h *Hub) (*captureSession, error) {
	originalStdout := os.Stdout
	originalStderr := os.Stderr

	stdoutReader, stdoutWriter, err := os.Pipe()
	if err != nil {
		log.Errorf("[consolelog] Pipe create failed stream=stdout error=%q", err.Error())
		return nil, err
	}
	stderrReader, stderrWriter, err := os.Pipe()
	if err != nil {
		stdoutReader.Close()
		log.Errorf("[consolelog] Pipe create failed stream=stderr error=%q", err.Error())
		stdoutWriter.Close()
		return nil, err
	}

	session := &captureSession{
		hub:            h,
		originalStdout: originalStdout,
		originalStderr: originalStderr,
		stdoutReader:   stdoutReader,
		stdoutWriter:   stdoutWriter,
		stderrReader:   stderrReader,
		stderrWriter:   stderrWriter,
	}

	os.Stdout = stdoutWriter
	os.Stderr = stderrWriter

	session.wg.Add(2)
	go func() {
		defer session.wg.Done()
		capturePipe(stdoutReader, originalStdout, h)
	}()
	go func() {
		defer session.wg.Done()
		capturePipe(stderrReader, originalStderr, h)
	}()

	return session, nil
}

func stopCaptureLocked() {
	if activeCapture == nil {
		return
	}

	if os.Stdout == activeCapture.stdoutWriter {
		os.Stdout = activeCapture.originalStdout
	}
	if os.Stderr == activeCapture.stderrWriter {
		os.Stderr = activeCapture.originalStderr
	}
	restoreStandardLogOutputLocked(activeCapture)

	if activeCapture.stdoutWriter != nil {
		_ = activeCapture.stdoutWriter.Close()
	}
	if activeCapture.stderrWriter != nil {
		_ = activeCapture.stderrWriter.Close()
	}
	if activeCapture.stdoutReader != nil {
		_ = activeCapture.stdoutReader.Close()
	}
	if activeCapture.stderrReader != nil {
		_ = activeCapture.stderrReader.Close()
	}

	activeCapture.wg.Wait()

	activeCapture = nil
}

func restoreStandardLogOutputLocked(session *captureSession) {
	if session == nil {
		return
	}

	currentOut := log.StandardLogger().Out
	if currentOut == session.stdoutWriter {
		log.SetOutput(session.originalStdout)
	}
	if currentOut == session.stderrWriter {
		log.SetOutput(session.originalStderr)
	}
}

func capturePipe(reader io.Reader, output io.Writer, h *Hub) {
	buf := make([]byte, 4096)
	var line strings.Builder

	for {
		n, err := reader.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			if output != nil {
				_, _ = output.Write(chunk)
			}

			remaining := chunk
			for len(remaining) > 0 {
				idx := bytes.IndexByte(remaining, '\n')
				if idx < 0 {
					appendCapturedBytes(&line, remaining)
					break
				}

				appendCapturedBytes(&line, remaining[:idx])
				h.Add(strings.TrimSuffix(line.String(), "\r"))
				line.Reset()
				remaining = remaining[idx+1:]
			}
		}

		if err != nil {
			if line.Len() > 0 {
				h.Add(strings.TrimSuffix(line.String(), "\r"))
			}
			return
		}
	}
}

func appendCapturedBytes(line *strings.Builder, value []byte) {
	remaining := maxCapturedLineBytes - line.Len()
	if remaining <= 0 {
		return
	}
	if len(value) > remaining {
		value = value[:remaining]
	}
	_, _ = line.Write(value)
}
