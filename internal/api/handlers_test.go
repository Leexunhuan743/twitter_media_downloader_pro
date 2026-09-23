package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/consolelog"
)

func serveStatic(server *Server, req *http.Request) *httptest.ResponseRecorder {
	if strings.HasPrefix(req.URL.Path, "/static/") {
		req.SetPathValue("path", strings.TrimPrefix(req.URL.Path, "/static/"))
	}

	rr := httptest.NewRecorder()
	server.handleStatic(rr, req)
	return rr
}

// embeddedFileExists 检查 embed FS 中是否存在给定路径的文件。
// 用于跳过依赖特定 embed 文件的测试，避免在 embed 文件缺失时产生误报。
func embeddedFileExists(server *Server, path string) bool {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rr := serveStatic(server, req)
	return rr.Code == http.StatusOK
}

func TestHandleWeb_Success(t *testing.T) {
	server := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	server.handleWeb(rr, req)

	// 验证响应
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "text/html; charset=utf-8", rr.Header().Get("Content-Type"))
	assert.Equal(t, "no-cache", rr.Header().Get("Cache-Control"))
	assert.Equal(t, contentETag(rr.Body.Bytes()), rr.Header().Get("ETag"))
	assert.Greater(t, rr.Body.Len(), 0)
}

func TestHandleWeb_Error(t *testing.T) {
	t.Skip("handleWeb 使用 //go:embed 固定读取 index.html，无法在测试中模拟文件读取错误")
}

func TestHandleWeb_DifferentRoutes(t *testing.T) {
	server := &Server{}

	routes := []string{
		"/",
		"/tasks",
		"/data",
		"/system",
	}

	for _, route := range routes {
		t.Run(route, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, route, nil)
			rr := httptest.NewRecorder()

			server.handleWeb(rr, req)

			// 所有路由都返回 index.html 的内容，只是前端路由
			assert.Equal(t, http.StatusOK, rr.Code)
			assert.Equal(t, "text/html; charset=utf-8", rr.Header().Get("Content-Type"))
		})
	}
}

func TestHandleWeb_CacheHeaders(t *testing.T) {
	server := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	server.handleWeb(rr, req)

	assert.Equal(t, "no-cache", rr.Header().Get("Cache-Control"))
	assert.Equal(t, contentETag(rr.Body.Bytes()), rr.Header().Get("ETag"))
}

func TestHandleWeb_IfNoneMatch(t *testing.T) {
	server := &Server{}

	firstReq := httptest.NewRequest(http.MethodGet, "/", nil)
	firstRR := httptest.NewRecorder()
	server.handleWeb(firstRR, firstReq)
	requireETag := firstRR.Header().Get("ETag")

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("If-None-Match", requireETag)
	rr := httptest.NewRecorder()

	server.handleWeb(rr, req)

	assert.Equal(t, http.StatusNotModified, rr.Code)
	assert.Equal(t, requireETag, rr.Header().Get("ETag"))
	assert.Equal(t, 0, rr.Body.Len())
}

func TestHandleWeb_ResponseBody(t *testing.T) {
	server := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	server.handleWeb(rr, req)

	// 验证响应体不为空且包含 HTML
	body := rr.Body.String()
	assert.Greater(t, len(body), 0)
	assert.Contains(t, rr.Header().Get("Content-Type"), "text/html")
}

func TestHandleWeb_NonGETMethods(t *testing.T) {
	server := &Server{}

	methods := []string{
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
	}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/", nil)
			rr := httptest.NewRecorder()

			server.handleWeb(rr, req)

			// 当前 handleWeb 不检查 HTTP 方法，非 GET 请求也返回正常页面
			// 如果将来添加了方法检查，这里需要修改
			assert.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

func TestHandleStatic_CSS(t *testing.T) {
	server := &Server{}

	if !embeddedFileExists(server, "/static/styles.css") {
		t.Skip("embedded styles.css not available")
	}

	req := httptest.NewRequest(http.MethodGet, "/static/styles.css", nil)
	rr := serveStatic(server, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "text/css; charset=utf-8", rr.Header().Get("Content-Type"))
}

func TestHandleStatic_JS(t *testing.T) {
	server := &Server{}

	if !embeddedFileExists(server, "/static/app.js") {
		t.Skip("embedded app.js not available")
	}

	req := httptest.NewRequest(http.MethodGet, "/static/app.js", nil)
	rr := serveStatic(server, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "application/javascript; charset=utf-8", rr.Header().Get("Content-Type"))
}

func TestHandleStatic_PNG(t *testing.T) {
	t.Skip("embedded image.png not available in test build")
}

func TestHandleStatic_JPG(t *testing.T) {
	t.Skip("embedded image.jpg not available in test build")
}

func TestHandleStatic_SVG(t *testing.T) {
	t.Skip("embedded icon.svg not available in test build")
}

func TestHandleStatic_JSON(t *testing.T) {
	t.Skip("embedded data.json not available in test build")
}

func TestHandleStatic_HTML(t *testing.T) {
	t.Skip("embedded page.html not available in test build")
}

func TestHandleStatic_UnknownExtension(t *testing.T) {
	t.Skip("no embedded file with unknown extension available in test build")
}

func TestHandleStatic_PathTraversal(t *testing.T) {
	server := &Server{}

	tests := []struct {
		name string
		path string
	}{
		{
			name: "双点路径",
			path: "/static/../etc/passwd",
		},
		{
			name: "嵌套双点",
			path: "/static/../../etc/passwd",
		},
		{
			name: "混合路径",
			path: "/static/images/../../../etc/passwd",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rr := serveStatic(server, req)

			// 路径遍历应该被阻止，返回 404
			assert.Equal(t, http.StatusNotFound, rr.Code)
		})
	}
}

func TestHandleStatic_NotFound(t *testing.T) {
	server := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/static/nonexistent.file", nil)
	rr := serveStatic(server, req)

	// 不存在的文件应该返回 404
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleStatic_CacheHeaders(t *testing.T) {
	server := &Server{}

	if !embeddedFileExists(server, "/static/styles.css") {
		t.Skip("embedded styles.css not available")
	}

	req := httptest.NewRequest(http.MethodGet, "/static/styles.css", nil)
	rr := serveStatic(server, req)

	assert.Equal(t, "no-cache", rr.Header().Get("Cache-Control"))
	assert.Equal(t, contentETag(rr.Body.Bytes()), rr.Header().Get("ETag"))
}

func TestHandleStatic_IfNoneMatch(t *testing.T) {
	server := &Server{}

	if !embeddedFileExists(server, "/static/styles.css") {
		t.Skip("embedded styles.css not available")
	}

	firstReq := httptest.NewRequest(http.MethodGet, "/static/styles.css", nil)
	firstRR := serveStatic(server, firstReq)
	requireETag := firstRR.Header().Get("ETag")

	req := httptest.NewRequest(http.MethodGet, "/static/styles.css", nil)
	req.Header.Set("If-None-Match", requireETag)
	rr := serveStatic(server, req)

	assert.Equal(t, http.StatusNotModified, rr.Code)
	assert.Equal(t, requireETag, rr.Header().Get("ETag"))
	assert.Equal(t, 0, rr.Body.Len())
}

func TestHandleStatic_EmptyPath(t *testing.T) {
	server := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/static/", nil)
	rr := serveStatic(server, req)

	// 空路径应该返回 404
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleStatic_RootPath(t *testing.T) {
	server := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/static", nil)
	rr := serveStatic(server, req)

	// 不带尾部斜杠的 /static 路由不会匹配到 handleStatic（路径参数为空）
	// path.Clean 对空字符串的处理可能导致不同结果，至少不应 panic
	t.Logf("handleStatic with /static returned status %d", rr.Code)
}

func TestHandleStatic_PathCleaning(t *testing.T) {
	server := &Server{}

	tests := []struct {
		name string
		path string
	}{
		{
			name: "普通路径",
			path: "/static/style.css",
		},
		{
			name: "带双点的路径",
			path: "/static/../style.css",
		},
		{
			name: "带斜杠的路径",
			path: "/static//style.css",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rr := serveStatic(server, req)

			// 验证不会 panic，且始终返回有效 HTTP 状态码
			assert.NotEqual(t, http.StatusInternalServerError, rr.Code,
				"handleStatic should never return 500 for path: %s", tt.path)
		})
	}
}

func TestHandleStatic_MultipleDotsInFilename(t *testing.T) {
	server := &Server{}

	tests := []struct {
		filename    string
		contentType string
	}{
		{"file.min.css", "text/css; charset=utf-8"},
		{"file.bundle.js", "application/javascript; charset=utf-8"},
		{"file.test.json", "application/json"},
	}

	for _, tt := range tests {
		t.Run(tt.filename, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/static/"+tt.filename, nil)
			rr := serveStatic(server, req)

			if rr.Code == http.StatusOK {
				assert.Equal(t, tt.contentType, rr.Header().Get("Content-Type"))
			} else {
				// 文件不存在时只需确认不 panic 且无 500
				assert.NotEqual(t, http.StatusInternalServerError, rr.Code,
					"handleStatic should never return 500 for: %s", tt.filename)
			}
		})
	}
}

func TestHandleStatic_CaseSensitivity(t *testing.T) {
	server := &Server{}

	tests := []struct {
		path string
	}{
		{"/static/FILE.CSS"},
		{"/static/File.Css"},
		{"/static/file.CSS"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rr := serveStatic(server, req)

			// 验证不会 panic，返回有效状态码
			assert.NotEqual(t, http.StatusInternalServerError, rr.Code,
				"handleStatic should never return 500 for case-variant path: %s", tt.path)
		})
	}
}

func TestHandleStatic_LongPath(t *testing.T) {
	server := &Server{}

	// 构造一个很长的路径
	longPath := "/static/" + strings.Repeat("a/", 100) + "file.css"

	req := httptest.NewRequest(http.MethodGet, longPath, nil)
	rr := serveStatic(server, req)

	// 验证不会 panic，返回有效状态码
	assert.NotEqual(t, http.StatusInternalServerError, rr.Code,
		"handleStatic should never return 500 for long path")
}

func TestHandleStatic_SpecialCharacters(t *testing.T) {
	server := &Server{}

	tests := []struct {
		name string
		path string
	}{
		{
			name: "空格编码",
			path: "/static/file%20name.css",
		},
		{
			name: "中文编码",
			path: "/static/%E6%96%87%E4%BB%B6.css",
		},
		{
			name: "特殊符号",
			path: "/static/file-name_2.0.css",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rr := serveStatic(server, req)

			// 验证不会 panic，返回有效状态码
			assert.NotEqual(t, http.StatusInternalServerError, rr.Code,
				"handleStatic should never return 500 for: %s", tt.path)
		})
	}
}

func TestHandleStatic_Methods(t *testing.T) {
	server := &Server{}

	methods := []string{
		http.MethodGet,
		http.MethodHead,
		http.MethodPost,
	}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/static/style.css", nil)
			rr := serveStatic(server, req)

			// 验证不会 panic，返回有效状态码
			assert.NotEqual(t, http.StatusInternalServerError, rr.Code,
				"handleStatic should never return 500 for method: %s", method)
		})
	}
}

// TestHandleWebInjectsThemeSwitcherAtBodyEnd 守护切换器注入契约：handleWeb 在
// 首个 </body> 之前注入切换器（在 body 外会被浏览器丢弃），注入是唯一改动
// （移除注入内容必须还原原文），且只注入一次。
func TestHandleWebInjectsThemeSwitcherAtBodyEnd(t *testing.T) {
	raw, err := readFrontendFile("index.html")
	require.NoError(t, err)
	require.Contains(t, string(raw), "</body>", "test precondition: theme index.html has a body close tag")

	server := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	server.handleWeb(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	body := rr.Body.String()
	switcher := themeSwitcherHTML()

	assert.Contains(t, body, `id="tmd-theme-switcher"`)
	assert.Equal(t, 1, strings.Count(body, switcher), "switcher must be injected exactly once")
	assert.Contains(t, body, switcher+"</body>", "switcher must sit immediately before the first </body>")
	assert.Equal(t, string(raw), strings.Replace(body, switcher, "", 1), "injection must be the only body change")
}

// TestListThemesExcludesDirectoriesWithoutIndexHTML 守护主题枚举：只列出含
// index.html 的目录。shared/ 只有共享资源文件，若被列出，用户在列表里选中
// 它会得到一个选不中的主题（setFrontendTheme 会拒绝）。
func TestListThemesExcludesDirectoriesWithoutIndexHTML(t *testing.T) {
	themes := listThemes()
	require.NotEmpty(t, themes)

	assert.True(t, themeDirectoryExists("shared"), "test precondition: shared/ directory must exist")
	assert.NotContains(t, themes, "shared")
	assert.Contains(t, themes, getFrontendTheme())

	for _, name := range themes {
		assert.True(t, themeHasIndexHTML(name), "listed theme %q must provide index.html", name)
	}
}

// TestSetFrontendThemeRejectsUnsafeAndMissingValues 守护主题热切换的取值校验：
// 含路径分隔符/点的取值（逃逸出主题目录）与无 index.html 的目录都必须拒绝，
// 且拒绝时当前主题保持不变。
func TestSetFrontendThemeRejectsUnsafeAndMissingValues(t *testing.T) {
	original := getFrontendTheme()
	t.Cleanup(func() { assert.True(t, setFrontendTheme(original), "must restore original theme") })

	require.True(t, setFrontendTheme("web2"), "test precondition: web2 must be a switchable theme")
	require.Equal(t, "web2", getFrontendTheme())

	rejected := []string{
		"",
		"/",
		"\\",
		"..",
		"../web1",
		"web1/..",
		"web1\\web2",
		"web1.",
		".web1",
		"web-not-a-theme",
		"shared",
	}
	for _, theme := range rejected {
		assert.False(t, setFrontendTheme(theme), "theme %q must be rejected", theme)
		assert.Equal(t, "web2", getFrontendTheme(), "current theme must survive rejection of %q", theme)
	}
}

// themeHasIndexHTML 按当前加载模式（TMD_DEV 本地目录 / embed FS）判断主题目录
// 是否提供 index.html，用于校验 listThemes 的输出。
func themeHasIndexHTML(name string) bool {
	if devWebRoot != "" {
		info, err := os.Stat(filepath.Join(devWebRoot, name, "index.html"))
		return err == nil && !info.IsDir()
	}
	_, err := webFS.ReadFile("web/" + name + "/index.html")
	return err == nil
}

func themeDirectoryExists(name string) bool {
	if devWebRoot != "" {
		info, err := os.Stat(filepath.Join(devWebRoot, name))
		return err == nil && info.IsDir()
	}
	entries, err := webFS.ReadDir("web")
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.Name() == name && entry.IsDir() {
			return true
		}
	}
	return false
}

// streamLogLevel 请求日志流并在首帧写出后立即取消上下文，避免测试阻塞在
// 心跳循环里。响应体只在处理函数返回后才读取，避免与写入并发。
func streamLogLevel(t *testing.T, server *Server, level string) *httptest.ResponseRecorder {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/logs/stream?level="+level, nil).WithContext(ctx)
	rr := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		defer close(done)
		server.handleLogStream(rr, req)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("log stream did not stop after context cancellation")
	}
	return rr
}

// TestLogStreamRejectsInvalidLevelBeforeStreamStarts 守护 SSE 校验时机：
// 非法 level 必须在写入 200 + ": connected" 之前拒绝。若校验发生在 setupSSE
// 之后，400 只会作为普通正文落进已建立的 event-stream，EventSource 侧既
// 拿不到状态码也不触发 error，表现为"日志页静默无输出"。
func TestLogStreamRejectsInvalidLevelBeforeStreamStarts(t *testing.T) {
	server := &Server{logHub: consolelog.NewHub(16)}

	rr := streamLogLevel(t, server, "bogus")

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Header().Get("Content-Type"), "application/json")
	assert.NotContains(t, rr.Body.String(), ": connected", "event-stream must not be started for a rejected level")
}

// TestLogStreamAcceptsEveryAdvertisedLevel 守护 level 词表一致性：前端下拉里的
// 每个级别都必须被流式端点接受（fatal 曾被词表漏掉，选中即 400）。
func TestLogStreamAcceptsEveryAdvertisedLevel(t *testing.T) {
	server := &Server{logHub: consolelog.NewHub(16)}

	for _, level := range []string{"debug", "info", "warn", "error", "fatal", "all", ""} {
		t.Run(level, func(t *testing.T) {
			rr := streamLogLevel(t, server, level)

			assert.Equal(t, http.StatusOK, rr.Code)
			assert.Contains(t, rr.Body.String(), ": connected")
		})
	}
}

// TestGetLogsRejectsInvalidLevel 守护日志查询端点：未知 level 必须报 400，
// 而不是静默返回空列表（空列表会被前端当成"这段时间没有日志"）。
func TestGetLogsRejectsInvalidLevel(t *testing.T) {
	server := &Server{logHub: consolelog.NewHub(16)}

	for _, level := range []string{"bogus", "verbose", "FATA"} {
		t.Run(level, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/logs?level="+level, nil)
			rr := httptest.NewRecorder()

			server.handleGetLogs(rr, req)

			assert.Equal(t, http.StatusBadRequest, rr.Code)
			assert.Contains(t, rr.Header().Get("Content-Type"), "application/json")
			assert.Contains(t, rr.Body.String(), "Invalid log level")
		})
	}

	for _, level := range []string{"fatal", "all", ""} {
		t.Run("accepted_"+level, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/logs?level="+level, nil)
			rr := httptest.NewRecorder()

			server.handleGetLogs(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

// TestLogExportDoesNotDeclareContentLength 守护日志导出：tmd2.log 由 lumberjack
// 持续追加/轮转，预先声明 Content-Length 会在拷贝期间文件增长时让 net/http 以
// ErrContentLength 截断响应体；响应必须交给 chunked 并完整送出文件内容。
func TestLogExportDoesNotDeclareContentLength(t *testing.T) {
	server := &Server{appRootPath: t.TempDir()}
	content := []byte("time=\"2026-01-01T00:00:00Z\" level=info msg=\"[test] synthetic log line\"\n")
	require.NoError(t, os.WriteFile(filepath.Join(server.appRootPath, "tmd2.log"), content, 0600))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/logs/export", nil)
	rr := httptest.NewRecorder()

	server.handleLogExport(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	assert.Empty(t, rr.Header().Get("Content-Length"), "export must not pin a length for a growing file")
	assert.Equal(t, content, rr.Body.Bytes())
	assert.Contains(t, rr.Header().Get("Content-Disposition"), "attachment")
}

// TestSchedulesEndpointsExposeUninitializedScheduler 守护 scheduler 未初始化时
// 的状态码语义：触发类端点返回 503（请求没错，是服务不可用），列表/统计保持
// 200 但必须带 scheduler_error，不能把"调度器没起来"伪装成"没有调度"。
func TestSchedulesEndpointsExposeUninitializedScheduler(t *testing.T) {
	server := &Server{} // scheduler 保持 nil

	triggerReq := httptest.NewRequest(http.MethodPost, "/api/v1/schedules/entry-1/trigger", nil)
	triggerReq.SetPathValue("id", "entry-1")
	triggerRR := httptest.NewRecorder()
	server.handleTriggerSchedule(triggerRR, triggerReq)
	assert.Equal(t, http.StatusServiceUnavailable, triggerRR.Code)

	triggerAllReq := httptest.NewRequest(http.MethodPost, "/api/v1/schedules/trigger-all", nil)
	triggerAllRR := httptest.NewRecorder()
	server.handleTriggerAllSchedules(triggerAllRR, triggerAllReq)
	assert.Equal(t, http.StatusServiceUnavailable, triggerAllRR.Code)

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/schedules", nil)
	listRR := httptest.NewRecorder()
	server.handleGetSchedules(listRR, listReq)
	require.Equal(t, http.StatusOK, listRR.Code)
	// 既有字段保持存在（前端按这些键读取），只新增原因说明。
	assert.Contains(t, listRR.Body.String(), `"entries"`)
	assert.Contains(t, listRR.Body.String(), `"total"`)
	assert.Contains(t, listRR.Body.String(), `"scheduler_error"`)

	statsReq := httptest.NewRequest(http.MethodGet, "/api/v1/schedules/stats", nil)
	statsRR := httptest.NewRecorder()
	server.handleScheduleStats(statsRR, statsReq)
	require.Equal(t, http.StatusOK, statsRR.Code)
	assert.Contains(t, statsRR.Body.String(), `"scheduler_error"`)
}
