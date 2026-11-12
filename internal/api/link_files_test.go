package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
)

// 链接文件的 path 必须能按 UserLink.Path 还原，测试直接用普通文件占位
// （Windows 上创建符号链接需要额外权限，这里只验证文件级清理逻辑）。
func seedUserLinkFile(t *testing.T, db interface {
	Get(dest interface{}, query string, args ...interface{}) error
}, link *database.UserLink) string {
	t.Helper()
	path, err := link.PathWithTx(db)
	require.NoError(t, err)
	require.NotEmpty(t, path)
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, []byte("link"), 0o600))
	return path
}

// 删除用户链接必须同时删除磁盘上的链接文件，否则留下无法追踪的孤儿文件。
func TestHandleDBUserLinkDeleteRemovesFile(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	_, links := seedUserLinkData(t, db)
	link := links[0]
	path := seedUserLinkFile(t, db, link)

	rr := httptest.NewRecorder()
	server.handleDBUserLinkDelete(rr, requestWithID(http.MethodDelete, "/api/v1/db/user-links/1", itoa(link.Id), nil))

	assert.Equal(t, http.StatusOK, rr.Code)
	_, statErr := os.Lstat(path)
	assert.True(t, os.IsNotExist(statErr), "link file should be removed together with the row")
	stored, dbErr := database.GetUserLinkById(db, link.Id)
	require.NoError(t, dbErr)
	assert.Nil(t, stored, "row should be gone")
}

// 改名必须同时移动磁盘链接，否则下次下载会按新名字再建一份。
func TestHandleDBUserLinkUpdateRenamesFile(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	_, links := seedUserLinkData(t, db)
	link := links[0]
	oldPath := seedUserLinkFile(t, db, link)
	newPath := filepath.Join(filepath.Dir(oldPath), "renamed")

	body := strings.NewReader(`{"name":"renamed"}`)
	rr := httptest.NewRecorder()
	server.handleDBUserLinkUpdate(rr, requestWithID(http.MethodPatch, "/api/v1/db/user-links/1", itoa(link.Id), body))

	require.Equal(t, http.StatusOK, rr.Code)
	_, oldErr := os.Lstat(oldPath)
	assert.True(t, os.IsNotExist(oldErr), "old link file should be moved")
	_, newErr := os.Lstat(newPath)
	assert.NoError(t, newErr, "renamed link file should exist")

	stored, err := database.GetUserLinkById(db, link.Id)
	require.NoError(t, err)
	assert.Equal(t, "renamed", stored.Name)
}

// 删除用户必须清理该用户的全部链接文件（DelUser 只会删除数据库行）。
func TestHandleDBUserDeleteRemovesLinkFiles(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	_, links := seedUserLinkData(t, db)
	link := links[0]
	path := seedUserLinkFile(t, db, link)

	rr := httptest.NewRecorder()
	server.handleDBUserDelete(rr, requestWithID(http.MethodDelete, "/api/v1/db/users/1", "1", nil))

	assert.Equal(t, http.StatusOK, rr.Code)
	_, statErr := os.Lstat(path)
	assert.True(t, os.IsNotExist(statErr), "user link file should be removed before the row cascade")
	user, err := database.GetUserById(db, 1)
	require.NoError(t, err)
	assert.Nil(t, user, "user row should be deleted")
}
