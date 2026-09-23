package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
)

func (s *Server) handleLogStream(w http.ResponseWriter, r *http.Request) {
	// 查询参数必须在 setupSSE 之前校验：setupSSE 会写出 200 + ": connected" 帧，
	// 之后再 writeError 只会把 400 当普通正文写进已建立的 event-stream，
	// EventSource 侧静默失效（浏览器既不触发 error 也拿不到状态码）。
	query := r.URL.Query()
	levelStr := query.Get("level")
	if levelStr != "" && !isValidLogLevel(levelStr) {
		log.Debugf("[sse] Invalid log level requested level=%q", levelStr)
		s.writeError(w, http.StatusBadRequest, "Invalid log level: "+levelStr)
		return
	}

	flusher, err := setupSSE(w)
	if err != nil {
		log.Errorf("[sse] Log stream setup failed error=%q", err.Error())
		s.writeError(w, http.StatusInternalServerError, "Streaming not supported")
		return
	}

	search := query.Get("q")
	domain := query.Get("domain")
	ctx := r.Context()
	ch, unsubscribe := s.logHub.Subscribe()
	defer unsubscribe()

	heartbeat := time.NewTicker(sseHeartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			if err := writeSSEFrame(w, flusher, func() error {
				return writeSSEHeartbeat(w)
			}); err != nil {
				return
			}
		case line, ok := <-ch:
			if !ok {
				return
			}
			if line == "" {
				continue
			}
			if !matchLogFilters(line, levelStr, search, domain) {
				continue
			}
			if err := writeSSEFrame(w, flusher, func() error {
				return writeSSEData(w, line)
			}); err != nil {
				return
			}
		}
	}
}

func writeSSEData(w http.ResponseWriter, line string) error {
	if _, err := fmt.Fprint(w, "event: log\n"); err != nil {
		return err
	}
	for _, part := range strings.Split(line, "\n") {
		if _, err := fmt.Fprintf(w, "data: %s\n", strings.TrimSuffix(part, "\r")); err != nil {
			return err
		}
	}
	_, err := fmt.Fprint(w, "\n")
	return err
}
