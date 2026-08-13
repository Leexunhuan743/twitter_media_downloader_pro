package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// P2-9 修复回归：普通 JSON 请求体必须有大小上限（MaxBytesReader），
// 超限返回 413，而不是让进程分配任意大内存。
func TestDecodeBodyRejectsOversizedJSON(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 超过 defaultJSONBodyLimit 的请求体（用足够大的 padding 字段）。
	huge := `{"screen_name":"user","padding":"` + strings.Repeat("a", defaultJSONBodyLimit+1024) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/download/user", strings.NewReader(huge))
	rr := httptest.NewRecorder()

	var dest struct {
		ScreenName string `json:"screen_name"`
	}
	ok := server.decodeBody(rr, req, &dest)

	assert.False(t, ok, "oversized body must be rejected")
	assert.Equal(t, http.StatusRequestEntityTooLarge, rr.Code)
}

// P2-9 回归保护：正常大小的 JSON 仍可解析。
func TestDecodeBodyAcceptsNormalJSON(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/download/user", strings.NewReader(`{"screen_name":"user"}`))
	rr := httptest.NewRecorder()

	var dest struct {
		ScreenName string `json:"screen_name"`
	}
	ok := server.decodeBody(rr, req, &dest)

	assert.True(t, ok)
	assert.Equal(t, "user", dest.ScreenName)
	assert.Equal(t, http.StatusOK, rr.Code)
}
