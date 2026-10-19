package api

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"
)

const (
	defaultLogsPageSize = 100
	maxLogsPageSize     = 200
)

// 日志行有两种格式：
//   - logrus 文本（输出被重定向、没有终端时）：time="2026-10-19T14:14:57+08:00" level=info msg="[api] GET …"
//   - logrus 终端（带颜色时）：INFO[2026-10-19T14:14:57+08:00] [api] GET …
//
// 两种格式都要能被级别 / 来源 / 时间过滤识别，否则服务端过滤会静默失效。
var (
	legacyLogLineRe = regexp.MustCompile(`^(DEBU|INFO|WARN|ERRO|FATA)\[([^\]]+)\]\s*(.*)$`)
	kvLogTimeRe     = regexp.MustCompile(`(?:^|\s)time=("([^"]*)"|([^\s]+))`)
	kvLogLevelRe    = regexp.MustCompile(`(?:^|\s)level="?([a-zA-Z]+)"?`)
	kvLogMsgRe      = regexp.MustCompile(`(?:^|\s)msg="((?:[^"\\]|\\.)*)"`)
	logDomainTagRe  = regexp.MustCompile(`^\s*\[([a-z0-9_-]+)\]`)
)

func parseLogTime(line string) (time.Time, bool) {
	var raw string
	if m := legacyLogLineRe.FindStringSubmatch(line); m != nil {
		raw = m[2]
	} else if m := kvLogTimeRe.FindStringSubmatch(line); m != nil {
		raw = m[2]
		if raw == "" {
			raw = m[3]
		}
	}
	if raw == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	} {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// parseLogLevel 返回日志行的规范化级别（debug/info/warn/error/fatal），无法识别时返回空串。
func parseLogLevel(line string) string {
	if m := legacyLogLineRe.FindStringSubmatch(line); m != nil {
		return normalizeLogLevel(m[1])
	}
	if m := kvLogLevelRe.FindStringSubmatch(line); m != nil {
		return normalizeLogLevel(m[1])
	}
	return ""
}

func normalizeLogLevel(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debu", "debug", "trace":
		return "debug"
	case "info":
		return "info"
	case "warn", "warni", "warning":
		return "warn"
	case "erro", "error", "err":
		return "error"
	case "fata", "fatal", "panic":
		return "fatal"
	}
	return ""
}

// logPayload 取日志正文（msg 字段内容，或旧格式里级别前缀之后的部分）。
func logPayload(line string) string {
	if m := legacyLogLineRe.FindStringSubmatch(line); m != nil {
		return m[3]
	}
	if m := kvLogMsgRe.FindStringSubmatch(line); m != nil {
		return unescapeLogField(m[1])
	}
	return strings.TrimSpace(line)
}

func unescapeLogField(value string) string {
	return strings.NewReplacer(`\n`, "\n", `\t`, "\t", `\r`, "", `\"`, `"`, `\\`, `\`).Replace(value)
}

func parseFilterTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func (s *Server) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	levelStr := query.Get("level")
	search := query.Get("q")
	domain := query.Get("domain")
	startStr := query.Get("start_time")
	endStr := query.Get("end_time")

	var startTime, endTime time.Time
	hasStart := false
	hasEnd := false
	if t, ok := parseFilterTime(startStr); ok {
		startTime = t
		hasStart = true
	}
	if t, ok := parseFilterTime(endStr); ok {
		endTime = t
		hasEnd = true
	}

	pagination := NewPaginationWithDefaults(r, defaultLogsPageSize, maxLogsPageSize, defaultPaginationSort, defaultSortOrder)

	filtered := filterLogLinesReverse(s.logHub.Snapshot(), levelStr, search, domain, hasStart, startTime, hasEnd, endTime)

	total := len(filtered)
	start := pagination.Offset
	end := start + pagination.PageSize
	if start >= total {
		filtered = []string{}
	} else if end > total {
		filtered = filtered[start:]
	} else {
		filtered = filtered[start:end]
	}

	resp := pagination.ToResponse(filtered, total)

	s.writeJSON(w, http.StatusOK, NewSuccessResponse(LogsResponse{
		Logs:       filtered,
		Total:      resp.Total,
		Page:       resp.Page,
		PageSize:   resp.PageSize,
		TotalPages: resp.TotalPages,
	}))
}

func (s *Server) handleLogStats(w http.ResponseWriter, r *http.Request) {
	lines := s.logHub.Snapshot()
	stats := map[string]int{"debug": 0, "info": 0, "warn": 0, "error": 0, "total": len(lines)}
	for _, line := range lines {
		switch parseLogLevel(line) {
		case "error", "fatal":
			stats["error"]++
		case "warn":
			stats["warn"]++
		case "debug":
			stats["debug"]++
		default:
			stats["info"]++
		}
	}
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(stats))
}

func (s *Server) handleLogExport(w http.ResponseWriter, r *http.Request) {
	logPath := filepath.Join(s.appRootPath, "tmd2.log")
	f, err := os.Open(logPath)
	if err != nil {
		log.Errorf("[logs] Open failed path=%q error=%q", logging.Path(logPath), err.Error())
		s.writeError(w, http.StatusInternalServerError, "Failed to open log file")
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err == nil {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", stat.Size()))
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tmd2-%s.log"`, time.Now().Format("20060102-150405")))
	w.WriteHeader(http.StatusOK)
	io.Copy(w, f)
}

// filterLogLinesReverse 从尾向头遍历（天然逆序），过滤并直接产出结果，一次遍历完成。
func filterLogLinesReverse(lines []string, level, search, domain string, hasStart bool, startTime time.Time, hasEnd bool, endTime time.Time) []string {
	result := make([]string, 0, len(lines))
	for i := len(lines) - 1; i >= 0; i-- {
		line := lines[i]
		if !matchLogFilters(line, level, search, domain) {
			continue
		}
		if hasStart || hasEnd {
			t, ok := parseLogTime(line)
			if ok {
				if hasStart && t.Before(startTime) {
					continue
				}
				if hasEnd && t.After(endTime) {
					continue
				}
			}
		}
		result = append(result, line)
	}
	return result
}

func matchLogFilters(line, level, search, domain string) bool {
	if level != "" && level != "all" && !matchLogLevel(line, level) {
		return false
	}
	if domain != "" && domain != "all" && !matchLogDomain(line, domain) {
		return false
	}
	if search != "" && !strings.Contains(strings.ToLower(line), strings.ToLower(search)) {
		return false
	}
	return true
}

func matchLogDomain(line, domain string) bool {
	domain = strings.ToLower(strings.TrimSpace(domain))
	domain = strings.TrimPrefix(strings.TrimSuffix(domain, "]"), "[")
	if domain == "" || domain == "all" {
		return true
	}
	if m := logDomainTagRe.FindStringSubmatch(strings.ToLower(logPayload(line))); m != nil {
		return m[1] == domain
	}
	// 兜底：没有 msg 字段的行，直接看整行开头的方括号标签。
	if m := logDomainTagRe.FindStringSubmatch(strings.ToLower(line)); m != nil {
		return m[1] == domain
	}
	return false
}

func matchLogLevel(line, level string) bool {
	level = normalizeLogLevel(level)
	if level == "" {
		// 空串 / all / 未知级别：不过滤
		raw := strings.ToLower(strings.TrimSpace(level))
		return raw == "" || raw == "all"
	}
	got := parseLogLevel(line)
	if got == "" {
		return false
	}
	if level == "error" {
		return got == "error" || got == "fatal"
	}
	return got == level
}

func isValidLogLevel(level string) bool {
	switch level {
	case "debug", "info", "warn", "error", "all":
		return true
	}
	return false
}
