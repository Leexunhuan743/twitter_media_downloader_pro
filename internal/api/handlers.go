package api

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	log "github.com/sirupsen/logrus"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

//go:embed web/*
var webFS embed.FS

var (
	themeMu       sync.RWMutex
	frontendTheme = "download" // 当前主题目录名（默认 download），运行时热切换
	devWebRoot    string       // TMD_DEV=1 时设为本地 web 目录路径
)

func init() {
	if os.Getenv("TMD_DEV") == "1" {
		_, filename, _, ok := runtime.Caller(0)
		if ok {
			devWebRoot = filepath.Join(filepath.Dir(filename), "web")
		}
	}
}

func readFrontendFile(name string) ([]byte, error) {
	themeMu.RLock()
	defer themeMu.RUnlock()
	if devWebRoot != "" {
		return os.ReadFile(filepath.Join(devWebRoot, frontendTheme, name))
	}
	return webFS.ReadFile("web/" + frontendTheme + "/" + name)
}

func readSharedFrontendFile(name string) ([]byte, error) {
	if devWebRoot != "" {
		return os.ReadFile(filepath.Join(devWebRoot, "shared", name))
	}
	return webFS.ReadFile("web/shared/" + name)
}

func setFrontendTheme(theme string) bool {
	themeMu.Lock()
	defer themeMu.Unlock()
	if theme == "" || strings.ContainsAny(theme, "/\\..") {
		return false
	}
	// 验证目录存在（开发模式走本地 FS，否则走 embed FS）
	if devWebRoot != "" {
		info, err := os.Stat(filepath.Join(devWebRoot, theme, "index.html"))
		if err != nil || info.IsDir() {
			return false
		}
	} else {
		if _, err := webFS.ReadFile("web/" + theme + "/index.html"); err != nil {
			return false
		}
	}
	frontendTheme = theme
	return true
}

func getFrontendTheme() string {
	themeMu.RLock()
	defer themeMu.RUnlock()
	return frontendTheme
}

// listThemes 列出所有可用主题目录（开发模式走本地 FS，否则走 embed FS）
func listThemes() []string {
	if devWebRoot != "" {
		entries, err := os.ReadDir(devWebRoot)
		if err != nil {
			return nil
		}
		var themes []string
		for _, e := range entries {
			if e.IsDir() {
				if _, err := os.Stat(filepath.Join(devWebRoot, e.Name(), "index.html")); err == nil {
					themes = append(themes, e.Name())
				}
			}
		}
		return themes
	}
	entries, err := webFS.ReadDir("web")
	if err != nil {
		return nil
	}
	var themes []string
	for _, e := range entries {
		if e.IsDir() {
			// 验证目录中有 index.html
			if _, err := webFS.ReadFile("web/" + e.Name() + "/index.html"); err == nil {
				themes = append(themes, e.Name())
			}
		}
	}
	return themes
}

// handleWeb 返回 Web 管理页面
func (s *Server) handleWeb(w http.ResponseWriter, r *http.Request) {
	data, err := readFrontendFile("index.html")
	if err != nil {
		log.Errorf("[web] Index load failed error=%q", err.Error())
		s.writeError(w, http.StatusInternalServerError, "Failed to load web page")
		return
	}

	s.writeCachedContent(w, r, data, "text/html; charset=utf-8", "no-cache")
}

// handleStatic 静态文件服务
func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	reqPath := r.PathValue("path")
	if reqPath == "" {
		http.NotFound(w, r)
		return
	}

	// 在 path.Clean 之前检查原始路径是否包含 ..
	if strings.Contains(reqPath, "..") {
		http.NotFound(w, r)
		return
	}

	// 使用 path.Clean 来规范化路径，自动处理掉所有的 "." 和 ".." 以及多余的斜杠
	cleanPath := path.Clean("/" + reqPath)

	cleanPath = strings.TrimPrefix(cleanPath, "/")

	var data []byte
	var err error
	if strings.HasPrefix(cleanPath, "shared/") {
		data, err = readSharedFrontendFile(strings.TrimPrefix(cleanPath, "shared/"))
	} else {
		data, err = readFrontendFile(cleanPath)
	}
	if err != nil {
		http.NotFound(w, r)
		return
	}

	contentType := "application/octet-stream"
	switch {
	case strings.HasSuffix(cleanPath, ".html"):
		contentType = "text/html; charset=utf-8"
	case strings.HasSuffix(cleanPath, ".css"):
		contentType = "text/css; charset=utf-8"
	case strings.HasSuffix(cleanPath, ".js"):
		contentType = "application/javascript; charset=utf-8"
	case strings.HasSuffix(cleanPath, ".json"):
		contentType = "application/json"
	case strings.HasSuffix(cleanPath, ".png"):
		contentType = "image/png"
	case strings.HasSuffix(cleanPath, ".jpg"), strings.HasSuffix(cleanPath, ".jpeg"):
		contentType = "image/jpeg"
	case strings.HasSuffix(cleanPath, ".svg"):
		contentType = "image/svg+xml"
	}

	s.writeCachedContent(w, r, data, contentType, "no-cache")
}

func (s *Server) writeCachedContent(w http.ResponseWriter, r *http.Request, data []byte, contentType, cacheControl string) {
	etag := contentETag(data)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("ETag", etag)

	if ifNoneMatch(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	if _, err := w.Write(data); err != nil {
		return
	}
}

func contentETag(data []byte) string {
	sum := sha256.Sum256(data)
	return `"` + hex.EncodeToString(sum[:]) + `"`
}

func ifNoneMatch(header, etag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || candidate == etag || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

// 主题 API HTTP 处理器

func (s *Server) handleGetTheme(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]string{
		"theme": getFrontendTheme(),
	}))
}

func (s *Server) handleSetTheme(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Theme string `json:"theme"`
	}
	s.limitJSONBody(w, r, defaultJSONBodyLimit)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		if s.writeBodyTooLarge(w, err) {
			return
		}
		log.Debugf("[theme] Invalid request body error=%q", err.Error())
		s.writeError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	if !setFrontendTheme(req.Theme) {
		log.Warnf("[theme] Invalid theme directory theme=%q", req.Theme)
		s.writeError(w, http.StatusBadRequest, "Invalid theme: directory not found or missing index.html")
		return
	}

	log.Infof("[theme] Switched theme=%s", req.Theme)
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]string{
		"theme": getFrontendTheme(),
	}))
}

func (s *Server) handleGetThemes(w http.ResponseWriter, r *http.Request) {
	themes := listThemes()
	if themes == nil {
		log.Error("[theme] List failed")
		s.writeError(w, http.StatusInternalServerError, "Failed to list themes")
		return
	}
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
		"themes":  themes,
		"current": getFrontendTheme(),
	}))
}
