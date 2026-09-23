package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestHandleSSETasks_ResponseHeaders(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	rr := httptest.NewRecorder()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		server.handleSSETasks(rr, req)
		close(done)
	}()

	select {
	case <-done:
		assert.Equal(t, "text/event-stream", rr.Header().Get("Content-Type"))
		assert.Equal(t, "no-cache", rr.Header().Get("Cache-Control"))
		assert.Equal(t, "keep-alive", rr.Header().Get("Connection"))
		assert.Equal(t, "no", rr.Header().Get("X-Accel-Buffering"))
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Test timeout")
	}
}

func TestHandleSSETasks_NoFlusherSupport(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	rr := &sseMockResponseWriter{headers: make(http.Header)}

	server.handleSSETasks(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.statusCode)
}

func TestHandleSSETasks_ContextCancellation(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	rr := httptest.NewRecorder()

	ctx, cancel := context.WithCancel(context.Background())
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		server.handleSSETasks(rr, req)
		close(done)
	}()

	cancel()

	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("SSE handler did not respond to context cancellation")
	}
}

func TestHandleSSETasks_ClientDisconnect(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	rr := httptest.NewRecorder()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		server.handleSSETasks(rr, req)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("SSE handler should return immediately on cancelled context")
	}
}

func TestHandleSSETasks_InitialPush(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	rr := httptest.NewRecorder()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	req = req.WithContext(ctx)

	server.handleSSETasks(rr, req)

	body := rr.Body.String()
	assert.Contains(t, body, "event: tasks")
}

func TestHandleSSETasks_EventBusPush(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	writer := newObservedSSEWriter()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		server.handleSSETasks(writer, req)
		close(done)
	}()

	// setupSSE and the initial task snapshot each flush once. Waiting for both
	// gives a synchronization point after the handler has subscribed, so the
	// notification below cannot be published into the void.
	writer.waitForFlushes(t, 2)
	eventBus.PublishNotification("task_completed", "test done", nil)
	// The notification frame itself flushes once it has been written.
	writer.waitForFlushes(t, 1)

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("SSE handler did not exit after context cancellation")
	}

	body := writer.String()
	assert.Contains(t, body, "event: notification")
	assert.Contains(t, body, "test done")
}

func TestHandleSSETasksFlushesShutdownEventBeforeReturning(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	writer := newObservedSSEWriter()
	done := make(chan struct{})
	go func() {
		server.handleSSETasks(writer, req)
		close(done)
	}()

	// setupSSE and the initial task snapshot each flush once. Waiting for both
	// gives a synchronization point after the handler has subscribed.
	writer.waitForFlushes(t, 2)
	eventBus.PublishServerShutdown("test shutdown")
	writer.waitForFlushes(t, 1)

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("SSE handler did not exit after flushing server_shutdown")
	}
	body := writer.String()
	assert.Contains(t, body, "event: server_shutdown")
	assert.Contains(t, body, "test shutdown")
}

func TestHandleSSETasks_ReplaysMissedNotifications(t *testing.T) {
	eventBus := NewEventBus()
	server := &Server{
		taskManager: NewTaskManager(eventBus),
		eventBus:    eventBus,
	}

	eventBus.PublishNotification("task_completed", "done-1", nil)
	eventBus.PublishNotification("task_failed", "done-2", nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sse/tasks", nil)
	req.Header.Set("Last-Event-ID", "1")
	rr := httptest.NewRecorder()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	req = req.WithContext(ctx)

	server.handleSSETasks(rr, req)

	body := rr.Body.String()
	assert.Contains(t, body, "event: tasks")
	assert.Contains(t, body, "id: 2")
	assert.Contains(t, body, `"type":"task_failed"`)
	assert.NotContains(t, body, `"type":"task_completed"`)
}

func TestSSENamedEventFormat(t *testing.T) {
	tasks := []*Task{
		{
			ID:     "task_123",
			Type:   TaskTypeUserDownload,
			Status: TaskStatusRunning,
			Progress: &TaskProgress{
				Total:     100,
				Completed: 50,
			},
		},
	}

	data, err := json.Marshal(tasks)
	assert.NoError(t, err)

	sseData := "event: tasks\ndata: " + string(data) + "\n\n"
	assert.True(t, strings.HasPrefix(sseData, "event: tasks\n"))
	assert.Contains(t, sseData, "data: ")
	assert.Contains(t, sseData, "\n\n")
	assert.Contains(t, sseData, "task_123")
}

func TestWriteSSENamedEventReturnsMarshalError(t *testing.T) {
	server := &Server{}
	rr := httptest.NewRecorder()

	err := server.writeSSENamedEvent(rr, rr, "bad", func() {})

	assert.Error(t, err)
	assert.Empty(t, rr.Body.String())
}

func TestWriteSSEHeartbeat(t *testing.T) {
	rr := httptest.NewRecorder()

	err := writeSSEHeartbeat(rr)

	assert.NoError(t, err)
	assert.Equal(t, ": heartbeat\n\n", rr.Body.String())
}

func TestWriteSSENamedEventReturnsWriteError(t *testing.T) {
	server := &Server{}
	rr := &errorResponseWriter{}

	err := server.writeSSENamedEvent(rr, rr, "tasks", []*Task{})

	assert.Error(t, err)
}

func TestWriteSSEEventIncludesID(t *testing.T) {
	server := &Server{}
	rr := httptest.NewRecorder()

	err := server.writeSSEEvent(rr, rr, SSEEvent{ID: 42, Event: "notification", Data: map[string]string{"message": "ok"}})

	assert.NoError(t, err)
	assert.Contains(t, rr.Body.String(), "id: 42\n")
	assert.Contains(t, rr.Body.String(), "event: notification\n")
}

type errorResponseWriter struct {
	headers http.Header
}

func (e *errorResponseWriter) Header() http.Header {
	if e.headers == nil {
		e.headers = make(http.Header)
	}
	return e.headers
}

func (e *errorResponseWriter) Write([]byte) (int, error) {
	return 0, assert.AnError
}

func (e *errorResponseWriter) WriteHeader(code int) {}

func (e *errorResponseWriter) Flush() {}

type sseMockResponseWriter struct {
	headers    http.Header
	statusCode int
	body       []byte
}

func (m *sseMockResponseWriter) Header() http.Header {
	if m.headers == nil {
		m.headers = make(http.Header)
	}
	return m.headers
}

func (m *sseMockResponseWriter) Write(b []byte) (int, error) {
	m.body = append(m.body, b...)
	return len(b), nil
}

func (m *sseMockResponseWriter) WriteHeader(code int) {
	m.statusCode = code
}

type observedSSEWriter struct {
	mu      sync.Mutex
	headers http.Header
	body    bytes.Buffer
	flushes chan struct{}
}

func newObservedSSEWriter() *observedSSEWriter {
	return &observedSSEWriter{
		headers: make(http.Header),
		flushes: make(chan struct{}, 8),
	}
}

func (w *observedSSEWriter) Header() http.Header { return w.headers }

func (w *observedSSEWriter) Write(value []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.body.Write(value)
}

func (w *observedSSEWriter) WriteHeader(int) {}

func (w *observedSSEWriter) Flush() { w.flushes <- struct{}{} }

func (w *observedSSEWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.body.String()
}

func (w *observedSSEWriter) waitForFlushes(t *testing.T, count int) {
	t.Helper()
	for i := 0; i < count; i++ {
		select {
		case <-w.flushes:
		case <-time.After(time.Second):
			t.Fatalf("timed out waiting for SSE flush %d of %d", i+1, count)
		}
	}
}
