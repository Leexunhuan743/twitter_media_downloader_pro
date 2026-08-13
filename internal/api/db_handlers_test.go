package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
	entitypkg "github.com/unkmonster/tmd/internal/entity"
)

// setupTestDB 创建测试数据库
func setupTestDB(t *testing.T) *sqlx.DB {
	db, err := sqlx.Connect(database.DriverName, database.MemoryDSN(true))
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	// 创建必要的表
	require.NoError(t, database.CreateTables(db))
	return db
}

// createTestServer 创建测试服务器
func createTestServer(t *testing.T) (*Server, *sqlx.DB) {
	db := setupTestDB(t)
	server := &Server{
		db:          db,
		taskManager: NewTaskManager(nil),
	}
	t.Cleanup(server.taskManager.Close)
	return server, db
}

func TestHandleDBUsers_Empty(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users", nil)
	rr := httptest.NewRecorder()

	server.handleDBUsers(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp APIResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.True(t, resp.Success)
}

func TestHandleDBUsers_WithData(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试用户
	user := &database.User{
		Id:           1,
		ScreenName:   "testuser",
		Name:         "Test User",
		IsProtected:  false,
		FriendsCount: 100,
		IsAccessible: true,
	}
	err := database.CreateUser(db, user)
	assert.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users", nil)
	rr := httptest.NewRecorder()

	server.handleDBUsers(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp APIResponse
	err = json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.True(t, resp.Success)

	// 验证响应数据
	data, ok := resp.Data.(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, float64(1), data["total"])
	items, ok := data["data"].([]interface{})
	assert.True(t, ok)
	assert.Len(t, items, 1)
	item, ok := items[0].(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, "testuser", item["screen_name"])
}

func TestHandleDBUsers_WithSearch(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试用户
	user := &database.User{
		Id:           1,
		ScreenName:   "searchuser",
		Name:         "Search User",
		IsProtected:  false,
		FriendsCount: 100,
		IsAccessible: true,
	}
	err := database.CreateUser(db, user)
	assert.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users?q=search", nil)
	rr := httptest.NewRecorder()

	server.handleDBUsers(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUsers_WithFilters(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试用户
	user := &database.User{
		Id:           1,
		ScreenName:   "testuser",
		Name:         "Test User",
		IsProtected:  true,
		FriendsCount: 100,
		IsAccessible: false,
	}
	err := database.CreateUser(db, user)
	assert.NoError(t, err)

	tests := []struct {
		name string
		url  string
	}{
		{
			name: "accessible filter true",
			url:  "/api/v1/db/users?accessible=true",
		},
		{
			name: "accessible filter false",
			url:  "/api/v1/db/users?accessible=false",
		},
		{
			name: "protected filter true",
			url:  "/api/v1/db/users?protected=true",
		},
		{
			name: "protected filter false",
			url:  "/api/v1/db/users?protected=false",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.url, nil)
			rr := httptest.NewRecorder()

			server.handleDBUsers(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

func TestHandleDBUserDetail_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBUserDetail(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBUserDetail_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users/invalid", nil)
	req.SetPathValue("id", "invalid")
	rr := httptest.NewRecorder()

	server.handleDBUserDetail(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBUserDetail_Success(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试用户
	user := &database.User{
		Id:           1,
		ScreenName:   "detailuser",
		Name:         "Detail User",
		IsProtected:  false,
		FriendsCount: 50,
		IsAccessible: true,
	}
	err := database.CreateUser(db, user)
	assert.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users/1", nil)
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()

	server.handleDBUserDetail(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp APIResponse
	err = json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.True(t, resp.Success)
}

func TestHandleDBUserUpdate_Success(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试用户
	user := &database.User{
		Id:           1,
		ScreenName:   "updateuser",
		Name:         "Update User",
		IsProtected:  false,
		FriendsCount: 50,
		IsAccessible: true,
	}
	err := database.CreateUser(db, user)
	assert.NoError(t, err)

	updateData := map[string]interface{}{
		"name":          "Updated Name",
		"friends_count": 100,
		"protected":     true,
		"is_accessible": false,
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/users/1", bytes.NewReader(body))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserUpdate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserUpdate_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	updateData := map[string]string{
		"name": "Updated Name",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/users/999", bytes.NewReader(body))
	req.SetPathValue("id", "999")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserUpdate(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBUserUpdate_InvalidBody(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试用户
	user := &database.User{
		Id:         1,
		ScreenName: "testuser",
		Name:       "Test User",
	}
	database.CreateUser(db, user)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/users/1", bytes.NewReader([]byte("invalid json")))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserUpdate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBPreviousNamesSearch(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 用户 1 改名两次（两条 previous name），用户 2 改名一次。
	for i := 1; i <= 2; i++ {
		user := &database.User{
			Id:         uint64(i),
			ScreenName: "current" + string(rune('0'+i)),
			Name:       "Current User " + string(rune('0'+i)),
		}
		require.NoError(t, database.CreateUser(db, user))
	}
	require.NoError(t, database.RecordUserPreviousName(db, 1, "Old Name A", "oldnamea"))
	require.NoError(t, database.RecordUserPreviousName(db, 1, "Old Name B", "oldnameb"))
	require.NoError(t, database.RecordUserPreviousName(db, 2, "Old Name C", "oldnamec"))
	require.NoError(t, database.RecordUserPreviousName(db, 2, "Old Name D", "oldnamed"))

	t.Run("search_matches_previous_name", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-previous-names?q=oldnamea", nil)
		rr := httptest.NewRecorder()
		server.handleDBPreviousNames(rr, req)
		// 修复前：带点限定字段被 validIdent 拒绝 → SQL 以 AND 结尾 → 500。
		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Body.String(), "oldnamea")
		assert.NotContains(t, rr.Body.String(), "oldnamec")
	})

	t.Run("search_matches_current_screen_name", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-previous-names?q=current2", nil)
		rr := httptest.NewRecorder()
		server.handleDBPreviousNames(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Body.String(), "oldnamec")
		assert.NotContains(t, rr.Body.String(), "oldnamea")
	})

	t.Run("search_without_keyword_still_lists", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-previous-names", nil)
		rr := httptest.NewRecorder()
		server.handleDBPreviousNames(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("search_with_user_id_filter", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-previous-names?userId=1&q=oldname", nil)
		rr := httptest.NewRecorder()
		server.handleDBPreviousNames(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Body.String(), "oldnamea")
		assert.Contains(t, rr.Body.String(), "oldnameb")
		assert.NotContains(t, rr.Body.String(), "oldnamec")
	})
}

func TestHandleDBUserDelete_Success(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试用户
	user := &database.User{
		Id:         1,
		ScreenName: "deleteuser",
		Name:       "Delete User",
	}
	database.CreateUser(db, user)

	// 创建用户实体（含磁盘目录）——删除用户必须连带删除实体目录。
	entityRow := &database.UserEntity{
		UserId:    1,
		Name:      "Delete User(deleteuser)",
		ParentDir: t.TempDir(),
	}
	require.NoError(t, database.CreateUserEntity(db, entityRow))
	entityDir := filepath.Join(entityRow.ParentDir, entityRow.Name)
	require.NoError(t, os.MkdirAll(entityDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(entityDir, "media.jpg"), []byte("data"), 0600))

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/users/1", nil)
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()

	server.handleDBUserDelete(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	// Verify user was deleted
	deletedUser, err := database.GetUserById(db, 1)
	assert.NoError(t, err)
	assert.Nil(t, deletedUser)
	// 实体行与目录都必须删除（staged removal 已完成）。
	remaining, err := database.QueryUserEntities(db, "user_id = ?", []interface{}{uint64(1)}, "", 10, 0)
	require.NoError(t, err)
	assert.Empty(t, remaining)
	assert.NoDirExists(t, entityDir)
}

func TestHandleDBUserDelete_FailClosedWhenCascadeCountFails(t *testing.T) {
	// P1-1：级联计数失败时必须拒绝整个删除，而不是 Warn+0 继续——
	// 否则只删一条实体、DelUser 事务删剩余行，留下无 journal 孤儿媒体目录。
	server, db := createTestServer(t)
	defer db.Close()

	user := &database.User{Id: 7, ScreenName: "countfail", Name: "Count Fail"}
	require.NoError(t, database.CreateUser(db, user))
	for i := 1; i <= 3; i++ {
		entityRow := &database.UserEntity{
			UserId:    7,
			Name:      fmt.Sprintf("Count Fail(%d)", i),
			ParentDir: t.TempDir(),
		}
		require.NoError(t, database.CreateUserEntity(db, entityRow))
		dir := filepath.Join(entityRow.ParentDir, entityRow.Name)
		require.NoError(t, os.MkdirAll(dir, 0755))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "media.jpg"), []byte("data"), 0600))
	}

	// 使 countUserCascade 的 user_previous_names 计数查询失败。
	_, err := db.Exec(`DROP TABLE user_previous_names`)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/users/7", nil)
	req.SetPathValue("id", "7")
	rr := httptest.NewRecorder()
	server.handleDBUserDelete(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	// 用户行、所有实体行与目录都必须保留——没有部分删除。
	deletedUser, err := database.GetUserById(db, 7)
	require.NoError(t, err)
	assert.NotNil(t, deletedUser)
	remaining, err := database.QueryUserEntities(db, "user_id = ?", []interface{}{uint64(7)}, "", 10, 0)
	require.NoError(t, err)
	assert.Len(t, remaining, 3)
}

func TestHandleDBUserDelete_MultipleEntitiesAllRemoved(t *testing.T) {
	// 多实体删除：全部实体行与目录都必须删除，且父用户行同时删除。
	server, db := createTestServer(t)
	defer db.Close()

	user := &database.User{Id: 8, ScreenName: "multi", Name: "Multi Entity"}
	require.NoError(t, database.CreateUser(db, user))
	var dirs []string
	for i := 1; i <= 3; i++ {
		entityRow := &database.UserEntity{
			UserId:    8,
			Name:      fmt.Sprintf("Multi Entity(%d)", i),
			ParentDir: t.TempDir(),
		}
		require.NoError(t, database.CreateUserEntity(db, entityRow))
		dir := filepath.Join(entityRow.ParentDir, entityRow.Name)
		require.NoError(t, os.MkdirAll(dir, 0755))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "media.jpg"), []byte("data"), 0600))
		dirs = append(dirs, dir)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/users/8", nil)
	req.SetPathValue("id", "8")
	rr := httptest.NewRecorder()
	server.handleDBUserDelete(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	deletedUser, err := database.GetUserById(db, 8)
	require.NoError(t, err)
	assert.Nil(t, deletedUser)
	remaining, err := database.QueryUserEntities(db, "user_id = ?", []interface{}{uint64(8)}, "", 10, 0)
	require.NoError(t, err)
	assert.Empty(t, remaining)
	for _, dir := range dirs {
		assert.NoDirExists(t, dir)
	}
}

func TestHandleDBUserDelete_RetryConvergesAfterMidLoopFailure(t *testing.T) {
	// 中途实体 Remove 失败：返回错误、父记录与未删实体保留（可重试收敛），
	// 已删实体不残留目录；移除注入后重试 DELETE 必须收敛到全删。
	server, db := createTestServer(t)
	defer db.Close()

	user := &database.User{Id: 9, ScreenName: "retry", Name: "Retry Delete"}
	require.NoError(t, database.CreateUser(db, user))
	var entityRows []*database.UserEntity
	for i := 1; i <= 2; i++ {
		entityRow := &database.UserEntity{
			UserId:    9,
			Name:      fmt.Sprintf("Retry Delete(%d)", i),
			ParentDir: t.TempDir(),
		}
		require.NoError(t, database.CreateUserEntity(db, entityRow))
		dir := filepath.Join(entityRow.ParentDir, entityRow.Name)
		require.NoError(t, os.MkdirAll(dir, 0755))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "media.jpg"), []byte("data"), 0600))
		entityRows = append(entityRows, entityRow)
	}

	// 第二个实体的 Remove 会在 DB 删除行时失败（TRIGGER 注入），
	// 其 staged 目录回滚；第一个实体正常删除。id 为测试内整数，内联安全。
	_, err := db.Exec(fmt.Sprintf(`CREATE TRIGGER fail_second BEFORE DELETE ON user_entities
		WHEN OLD.id = %d BEGIN SELECT RAISE(FAIL, 'injected'); END`, int(entityRows[1].Id.Int32)))
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/users/9", nil)
	req.SetPathValue("id", "9")
	rr := httptest.NewRecorder()
	server.handleDBUserDelete(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	// 父记录仍在；第二个实体（行+目录）保留。
	deletedUser, err := database.GetUserById(db, 9)
	require.NoError(t, err)
	assert.NotNil(t, deletedUser)
	secondDir := filepath.Join(entityRows[1].ParentDir, entityRows[1].Name)
	assert.DirExists(t, secondDir)
	remaining, err := database.QueryUserEntities(db, "user_id = ?", []interface{}{uint64(9)}, "", 10, 0)
	require.NoError(t, err)
	assert.Len(t, remaining, 1)
	assert.Equal(t, entityRows[1].Name, remaining[0].Name)

	// 移除注入后重试：全部收敛删除。
	_, err = db.Exec(`DROP TRIGGER fail_second`)
	require.NoError(t, err)
	req2 := httptest.NewRequest(http.MethodDelete, "/api/v1/db/users/9", nil)
	req2.SetPathValue("id", "9")
	rr2 := httptest.NewRecorder()
	server.handleDBUserDelete(rr2, req2)

	assert.Equal(t, http.StatusOK, rr2.Code)
	deletedUser2, err := database.GetUserById(db, 9)
	require.NoError(t, err)
	assert.Nil(t, deletedUser2)
	remaining2, err := database.QueryUserEntities(db, "user_id = ?", []interface{}{uint64(9)}, "", 10, 0)
	require.NoError(t, err)
	assert.Empty(t, remaining2)
}

func TestHandleDBUserDelete_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/users/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBUserDelete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBLists_Empty(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists", nil)
	rr := httptest.NewRecorder()

	server.handleDBLists(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBLists_WithData(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建测试列表
	lst := &database.Lst{
		Id:          1,
		Name:        "Test List",
		OwnerUserId: 100,
	}
	err := database.CreateLst(db, lst)
	assert.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists", nil)
	rr := httptest.NewRecorder()

	server.handleDBLists(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBLists_WithSearch(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	lst := &database.Lst{
		Id:          1,
		Name:        "Search List",
		OwnerUserId: 100,
	}
	database.CreateLst(db, lst)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists?q=Search", nil)
	rr := httptest.NewRecorder()

	server.handleDBLists(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBLists_WithOwnerFilter(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	lst := &database.Lst{
		Id:          1,
		Name:        "Test List",
		OwnerUserId: 100,
	}
	_ = database.CreateLst(db, lst)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists?ownerId=100", nil)
	rr := httptest.NewRecorder()

	server.handleDBLists(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBLists_WithInvalidOwnerFilter(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists?ownerId=invalid", nil)
	rr := httptest.NewRecorder()

	server.handleDBLists(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBListDetail_Success(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	lst := &database.Lst{
		Id:          1,
		Name:        "Detail List",
		OwnerUserId: 100,
	}
	database.CreateLst(db, lst)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists/1", nil)
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()

	server.handleDBListDetail(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBListDetail_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBListDetail(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBListDetail_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists/invalid", nil)
	req.SetPathValue("id", "invalid")
	rr := httptest.NewRecorder()

	server.handleDBListDetail(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBListUpdate_Success(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	lst := &database.Lst{
		Id:          1,
		Name:        "Old Name",
		OwnerUserId: 100,
	}
	database.CreateLst(db, lst)

	updateData := map[string]string{
		"name":          "New Name",
		"owner_user_id": "200",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/lists/1", bytes.NewReader(body))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBListUpdate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBListUpdate_InvalidOwnerID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	lst := &database.Lst{
		Id:          1,
		Name:        "Test List",
		OwnerUserId: 100,
	}
	database.CreateLst(db, lst)

	updateData := map[string]string{
		"owner_user_id": "invalid",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/lists/1", bytes.NewReader(body))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBListUpdate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBListDelete_Success(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	lst := &database.Lst{
		Id:          1,
		Name:        "Delete List",
		OwnerUserId: 100,
	}
	database.CreateLst(db, lst)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/lists/1", nil)
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()

	server.handleDBListDelete(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBListDelete_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/lists/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBListDelete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBUserEntities_Empty(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-entities", nil)
	rr := httptest.NewRecorder()

	server.handleDBUserEntities(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserEntities_WithFilters(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	tests := []struct {
		name string
		url  string
	}{
		{
			name: "search filter",
			url:  "/api/v1/db/user-entities?q=test",
		},
		{
			name: "userId filter",
			url:  "/api/v1/db/user-entities?userId=1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.url, nil)
			rr := httptest.NewRecorder()

			server.handleDBUserEntities(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

func TestHandleDBUserEntities_InvalidUserIDFilter(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-entities?userId=not-number", nil)
	rr := httptest.NewRecorder()

	server.handleDBUserEntities(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBUserEntityDetail_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-entities/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityDetail(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBUserEntityDetail_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-entities/invalid", nil)
	req.SetPathValue("id", "invalid")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityDetail(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBUserEntityUpdate_InvalidBody(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/user-entities/1", bytes.NewReader([]byte("invalid")))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityUpdate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBUserEntityDelete_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/user-entities/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityDelete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBUserEntityDeleteRemovesStorageDirectory(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "delete_user", Name: "Delete User", IsAccessible: true}))
	parentDir := t.TempDir()
	record := &database.UserEntity{UserId: 1, Name: "delete-user", ParentDir: parentDir}
	require.NoError(t, database.CreateUserEntity(db, record))
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, record.Name), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(parentDir, record.Name, "data.txt"), []byte("data"), 0600))

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/user-entities/1", nil)
	req.SetPathValue("id", strconv.Itoa(int(record.Id.Int32)))
	rr := httptest.NewRecorder()
	server.handleDBUserEntityDelete(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.NoDirExists(t, filepath.Join(parentDir, record.Name))
	stored, err := database.GetUserEntity(db, int(record.Id.Int32))
	require.NoError(t, err)
	assert.Nil(t, stored)
}

func TestHandleDBListEntities_Empty(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/list-entities", nil)
	rr := httptest.NewRecorder()

	server.handleDBListEntities(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBListEntities_WithFilters(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	tests := []struct {
		name string
		url  string
	}{
		{
			name: "search filter",
			url:  "/api/v1/db/list-entities?q=test",
		},
		{
			name: "listId filter",
			url:  "/api/v1/db/list-entities?listId=1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.url, nil)
			rr := httptest.NewRecorder()

			server.handleDBListEntities(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

func TestHandleDBListEntities_InvalidListIDFilter(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/list-entities?listId=not-number", nil)
	rr := httptest.NewRecorder()

	server.handleDBListEntities(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBListEntityDetail_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/list-entities/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBListEntityDetail(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBListEntityUpdate_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	updateData := map[string]string{
		"name": "New Name",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/list-entities/999", bytes.NewReader(body))
	req.SetPathValue("id", "999")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBListEntityUpdate(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBListEntityDelete_NotFound(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/list-entities/999", nil)
	req.SetPathValue("id", "999")
	rr := httptest.NewRecorder()

	server.handleDBListEntityDelete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDBListEntityDeleteRemovesStorageDirectory(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	require.NoError(t, database.CreateLst(db, &database.Lst{Id: 1, Name: "Delete List", OwnerUserId: 10}))
	parentDir := t.TempDir()
	record := &database.LstEntity{LstId: 1, Name: "delete-list", ParentDir: parentDir}
	require.NoError(t, database.CreateLstEntity(db, record))
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, record.Name), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(parentDir, record.Name, "data.txt"), []byte("data"), 0600))

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/list-entities/1", nil)
	req.SetPathValue("id", strconv.Itoa(int(record.Id.Int32)))
	rr := httptest.NewRecorder()
	server.handleDBListEntityDelete(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.NoDirExists(t, filepath.Join(parentDir, record.Name))
	stored, err := database.GetLstEntity(db, int(record.Id.Int32))
	require.NoError(t, err)
	assert.Nil(t, stored)
}

func TestHandleDBUserLinks_Empty(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-links", nil)
	rr := httptest.NewRecorder()

	server.handleDBUserLinks(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserLinks_WithFilters(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	tests := []struct {
		name string
		url  string
	}{
		{
			name: "userId filter",
			url:  "/api/v1/db/user-links?userId=1",
		},
		{
			name: "listEntityId filter",
			url:  "/api/v1/db/user-links?listEntityId=1",
		},
		{
			name: "both filters",
			url:  "/api/v1/db/user-links?userId=1&listEntityId=1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.url, nil)
			rr := httptest.NewRecorder()

			server.handleDBUserLinks(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

func TestHandleDBUserLinks_InvalidNumericFilters(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	tests := []string{
		"/api/v1/db/user-links?userId=not-number",
		"/api/v1/db/user-links?listEntityId=not-number",
	}

	for _, url := range tests {
		t.Run(url, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, url, nil)
			rr := httptest.NewRecorder()

			server.handleDBUserLinks(rr, req)

			assert.Equal(t, http.StatusBadRequest, rr.Code)
		})
	}
}

func TestHandleDBUserPreviousNames_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users/invalid/previous-names", nil)
	req.SetPathValue("id", "invalid")
	rr := httptest.NewRecorder()

	server.handleDBUserPreviousNames(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBUserPreviousNames_Empty(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建用户
	user := &database.User{
		Id:         1,
		ScreenName: "testuser",
		Name:       "Test User",
	}
	database.CreateUser(db, user)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users/1/previous-names", nil)
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()

	server.handleDBUserPreviousNames(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestNullInt32(t *testing.T) {
	tests := []struct {
		name     string
		input    sql.NullInt32
		expected int32
	}{
		{
			name:     "正常值",
			input:    sql.NullInt32{Int32: 42, Valid: true},
			expected: 42,
		},
		{
			name:     "零值",
			input:    sql.NullInt32{Int32: 0, Valid: true},
			expected: 0,
		},
		{
			name:     "无效值",
			input:    sql.NullInt32{Valid: false},
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := nullInt32(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestSortFieldsMaps(t *testing.T) {
	t.Run("userSortFields", func(t *testing.T) {
		assert.Contains(t, userSortFields, "id")
		assert.Contains(t, userSortFields, "screen_name")
		assert.Contains(t, userSortFields, "name")
		assert.Contains(t, userSortFields, "friends_count")
		assert.Contains(t, userSortFields, "is_accessible")
	})

	t.Run("listSortFields", func(t *testing.T) {
		assert.Contains(t, listSortFields, "id")
		assert.Contains(t, listSortFields, "name")
		assert.Contains(t, listSortFields, "owner_id")
	})

	t.Run("entitySortFields", func(t *testing.T) {
		assert.Contains(t, entitySortFields, "id")
		assert.Contains(t, entitySortFields, "user_id")
		assert.Contains(t, entitySortFields, "name")
		assert.Contains(t, entitySortFields, "media_count")
		assert.Contains(t, entitySortFields, "latest_release_time")
	})
}

func TestHandleDBUsers_Pagination(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建多个用户
	for i := 1; i <= 25; i++ {
		user := &database.User{
			Id:           uint64(i),
			ScreenName:   fmt.Sprintf("user%d", i),
			Name:         fmt.Sprintf("User %d", i),
			IsProtected:  false,
			FriendsCount: i * 10,
			IsAccessible: true,
		}
		database.CreateUser(db, user)
	}

	tests := []struct {
		name         string
		query        string
		expectedCode int
	}{
		{
			name:         "默认分页",
			query:        "",
			expectedCode: http.StatusOK,
		},
		{
			name:         "第二页",
			query:        "page=2",
			expectedCode: http.StatusOK,
		},
		{
			name:         "自定义页面大小",
			query:        "pageSize=10",
			expectedCode: http.StatusOK,
		},
		{
			name:         "排序",
			query:        "sortBy=name&sortOrder=asc",
			expectedCode: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := "/api/v1/db/users"
			if tt.query != "" {
				url = url + "?" + tt.query
			}
			req := httptest.NewRequest(http.MethodGet, url, nil)
			rr := httptest.NewRecorder()

			server.handleDBUsers(rr, req)

			assert.Equal(t, tt.expectedCode, rr.Code)
		})
	}
}

func TestHandleDBLists_Pagination(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/lists?page=1&pageSize=10&sortBy=name&sortOrder=asc", nil)
	rr := httptest.NewRecorder()

	server.handleDBLists(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserEntities_Pagination(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-entities?page=1&pageSize=10&sortBy=name&sortOrder=desc", nil)
	rr := httptest.NewRecorder()

	server.handleDBUserEntities(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBListEntities_Pagination(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/list-entities?page=1&pageSize=10", nil)
	rr := httptest.NewRecorder()

	server.handleDBListEntities(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserLinks_Pagination(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/user-links?page=1&pageSize=10", nil)
	rr := httptest.NewRecorder()

	server.handleDBUserLinks(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserPreviousNames_Pagination(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建用户
	user := &database.User{
		Id:         1,
		ScreenName: "testuser",
		Name:       "Test User",
	}
	database.CreateUser(db, user)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/users/1/previous-names?page=1&pageSize=10", nil)
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()

	server.handleDBUserPreviousNames(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserUpdate_PartialFields(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建用户
	user := &database.User{
		Id:           1,
		ScreenName:   "testuser",
		Name:         "Original Name",
		IsProtected:  false,
		FriendsCount: 50,
		IsAccessible: true,
	}
	database.CreateUser(db, user)

	// 只更新 name
	updateData := map[string]string{
		"name": "New Name Only",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/users/1", bytes.NewReader(body))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserUpdate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserUpdate_RejectsEmptyStrings(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	user := &database.User{
		Id:           1,
		ScreenName:   "testuser",
		Name:         "Original Name",
		IsProtected:  false,
		FriendsCount: 50,
		IsAccessible: true,
	}
	database.CreateUser(db, user)

	t.Run("rejects empty screen_name", func(t *testing.T) {
		updateData := map[string]string{
			"screen_name": "",
		}
		body, _ := json.Marshal(updateData)
		req := httptest.NewRequest(http.MethodPut, "/api/v1/db/users/1", bytes.NewReader(body))
		req.SetPathValue("id", "1")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		server.handleDBUserUpdate(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("rejects empty name", func(t *testing.T) {
		updateData := map[string]string{
			"name": "",
		}
		body, _ := json.Marshal(updateData)
		req := httptest.NewRequest(http.MethodPut, "/api/v1/db/users/1", bytes.NewReader(body))
		req.SetPathValue("id", "1")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		server.handleDBUserUpdate(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("rejects invalid screen_name format", func(t *testing.T) {
		updateData := map[string]string{
			"screen_name": "invalid name with spaces!",
		}
		body, _ := json.Marshal(updateData)
		req := httptest.NewRequest(http.MethodPut, "/api/v1/db/users/1", bytes.NewReader(body))
		req.SetPathValue("id", "1")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		server.handleDBUserUpdate(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleDBListUpdate_PartialFields(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建列表
	lst := &database.Lst{
		Id:          1,
		Name:        "Original Name",
		OwnerUserId: 100,
	}
	database.CreateLst(db, lst)

	// 只更新 name
	updateData := map[string]string{
		"name": "New List Name",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/lists/1", bytes.NewReader(body))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBListUpdate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserEntityUpdate_PartialFields(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建用户
	user := &database.User{
		Id:         1,
		ScreenName: "testuser",
		Name:       "Test User",
	}
	database.CreateUser(db, user)

	// 创建实体
	parentDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    1,
		Name:      "Original Name",
		ParentDir: parentDir,
	}
	database.CreateUserEntity(db, entity)
	assert.NoError(t, os.Mkdir(filepath.Join(parentDir, entity.Name), 0755))

	// 只更新 name
	updateData := map[string]string{
		"name": "New Entity Name",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/user-entities/1", bytes.NewReader(body))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityUpdate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.NoDirExists(t, filepath.Join(parentDir, "Original Name"))
	assert.DirExists(t, filepath.Join(parentDir, "New Entity Name"))
	updated, err := database.GetUserEntity(db, int(entity.Id.Int32))
	assert.NoError(t, err)
	assert.Equal(t, "New Entity Name", updated.Name)
}

func TestHandleDBUserEntityUpdate_ValidatesBeforeRename(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	require.NoError(t, database.CreateUser(db, &database.User{
		Id:           1,
		ScreenName:   "entity_test",
		Name:         "Entity Test",
		IsAccessible: true,
	}))
	parentDir := t.TempDir()
	record := &database.UserEntity{UserId: 1, Name: "Original Name", ParentDir: parentDir}
	require.NoError(t, database.CreateUserEntity(db, record))
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, record.Name), 0755))

	body := bytes.NewBufferString(`{"name":"New Entity Name","latest_release_time":"invalid"}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/user-entities/1", body)
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityUpdate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.DirExists(t, filepath.Join(parentDir, "Original Name"))
	assert.NoDirExists(t, filepath.Join(parentDir, "New Entity Name"))
	updated, err := database.GetUserEntity(db, int(record.Id.Int32))
	require.NoError(t, err)
	assert.Equal(t, "Original Name", updated.Name)
}

func TestHandleDBUserEntityUpdateRejectsWindowsIncompatibleNames(t *testing.T) {
	for _, name := range []string{"foo:", "CON", "con.txt"} {
		t.Run(name, func(t *testing.T) {
			server, db := createTestServer(t)
			defer db.Close()
			require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "entity_test", Name: "Entity Test", IsAccessible: true}))
			parentDir := t.TempDir()
			record := &database.UserEntity{UserId: 1, Name: "Original Name", ParentDir: parentDir}
			require.NoError(t, database.CreateUserEntity(db, record))
			require.NoError(t, os.Mkdir(filepath.Join(parentDir, record.Name), 0755))
			body, err := json.Marshal(map[string]string{"name": name})
			require.NoError(t, err)
			req := httptest.NewRequest(http.MethodPatch, "/api/v1/db/user-entities/1", bytes.NewReader(body))
			req.SetPathValue("id", strconv.Itoa(int(record.Id.Int32)))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			server.handleDBUserEntityUpdate(rr, req)

			assert.Equal(t, http.StatusBadRequest, rr.Code)
			assert.DirExists(t, filepath.Join(parentDir, "Original Name"))
		})
	}
}

func TestHandleDBUserEntityUpdatePartialSuccessReportsSavedMetadata(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "entity_test", Name: "Entity Test", IsAccessible: true}))
	parentDir := t.TempDir()
	record := &database.UserEntity{UserId: 1, Name: "Original Name", ParentDir: parentDir}
	require.NoError(t, database.CreateUserEntity(db, record))
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, record.Name), 0755))
	// 预置目标目录使 Rename 必然 ErrPathConflict。
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, "Conflict Target"), 0755))

	t.Run("metadata_saved_with_conflicting_name", func(t *testing.T) {
		body := `{"name":"Conflict Target","media_count":10}`
		req := httptest.NewRequest(http.MethodPatch, "/api/v1/db/user-entities/"+strconv.Itoa(int(record.Id.Int32)), bytes.NewBufferString(body))
		req.SetPathValue("id", strconv.Itoa(int(record.Id.Int32)))
		rr := httptest.NewRecorder()
		server.handleDBUserEntityUpdate(rr, req)

		assert.Equal(t, http.StatusConflict, rr.Code)
		assert.Contains(t, rr.Body.String(), "statistics were saved")
		// 元数据已提交但目录未改名。
		after, err := database.GetUserEntity(db, int(record.Id.Int32))
		require.NoError(t, err)
		require.True(t, after.MediaCount.Valid)
		assert.Equal(t, int32(10), after.MediaCount.Int32)
		assert.Equal(t, "Original Name", after.Name)
		assert.DirExists(t, filepath.Join(parentDir, "Original Name"))
	})

	t.Run("conflict_without_metadata_has_no_hint", func(t *testing.T) {
		body := `{"name":"Conflict Target"}`
		req := httptest.NewRequest(http.MethodPatch, "/api/v1/db/user-entities/"+strconv.Itoa(int(record.Id.Int32)), bytes.NewBufferString(body))
		req.SetPathValue("id", strconv.Itoa(int(record.Id.Int32)))
		rr := httptest.NewRecorder()
		server.handleDBUserEntityUpdate(rr, req)

		assert.Equal(t, http.StatusConflict, rr.Code)
		assert.NotContains(t, rr.Body.String(), "statistics were saved")
	})
}

func TestHandleDBUserEntityUpdateSeparatesMetadataFromRename(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "entity_test", Name: "Entity Test", IsAccessible: true}))
	parentDir := t.TempDir()
	record := &database.UserEntity{UserId: 1, Name: "Original Name", ParentDir: parentDir}
	require.NoError(t, database.CreateUserEntity(db, record))
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, record.Name), 0755))
	_, triggerErr := db.Exec(`
		CREATE TRIGGER reject_combined_entity_update
		BEFORE UPDATE ON user_entities
		WHEN NEW.name <> OLD.name AND NEW.media_count IS NOT OLD.media_count
		BEGIN
			SELECT RAISE(FAIL, 'name and metadata must be updated separately');
		END;
	`)
	require.NoError(t, triggerErr)

	body := bytes.NewBufferString(`{"name":"New Entity Name","media_count":10}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/db/user-entities/1", body)
	req.SetPathValue("id", strconv.Itoa(int(record.Id.Int32)))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	server.handleDBUserEntityUpdate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.NoDirExists(t, filepath.Join(parentDir, "Original Name"))
	assert.DirExists(t, filepath.Join(parentDir, "New Entity Name"))
	stored, err := database.GetUserEntity(db, int(record.Id.Int32))
	require.NoError(t, err)
	assert.Equal(t, "New Entity Name", stored.Name)
	assert.Equal(t, int32(10), stored.MediaCount.Int32)
}

func TestHandleDBListEntityUpdate_PartialFields(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 创建列表
	lst := &database.Lst{
		Id:          1,
		Name:        "Test List",
		OwnerUserId: 100,
	}
	database.CreateLst(db, lst)

	// 创建列表实体
	parentDir := t.TempDir()
	entity := &database.LstEntity{
		LstId:     1,
		Name:      "Original Name",
		ParentDir: parentDir,
	}
	database.CreateLstEntity(db, entity)
	assert.NoError(t, os.Mkdir(filepath.Join(parentDir, entity.Name), 0755))

	// 只更新 name
	updateData := map[string]string{
		"name": "New List Entity Name",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/list-entities/1", bytes.NewReader(body))
	req.SetPathValue("id", "1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBListEntityUpdate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.NoDirExists(t, filepath.Join(parentDir, "Original Name"))
	assert.DirExists(t, filepath.Join(parentDir, "New List Entity Name"))
	updated, err := database.GetLstEntity(db, int(entity.Id.Int32))
	assert.NoError(t, err)
	assert.Equal(t, "New List Entity Name", updated.Name)
}

func TestHandleDBUserEntityUpdate_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	updateData := map[string]string{
		"name": "New Name",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/user-entities/invalid", bytes.NewReader(body))
	req.SetPathValue("id", "invalid")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityUpdate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBListEntityUpdate_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	updateData := map[string]string{
		"name": "New Name",
	}
	body, _ := json.Marshal(updateData)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/db/list-entities/invalid", bytes.NewReader(body))
	req.SetPathValue("id", "invalid")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.handleDBListEntityUpdate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBListEntityDetail_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/db/list-entities/invalid", nil)
	req.SetPathValue("id", "invalid")
	rr := httptest.NewRecorder()

	server.handleDBListEntityDetail(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBUserEntityDelete_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/user-entities/invalid", nil)
	req.SetPathValue("id", "invalid")
	rr := httptest.NewRecorder()

	server.handleDBUserEntityDelete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBListEntityDelete_InvalidID(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/db/list-entities/invalid", nil)
	req.SetPathValue("id", "invalid")
	rr := httptest.NewRecorder()

	server.handleDBListEntityDelete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDBUsers_URLQuery(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	// 测试 URL 查询参数解析
	u := &url.URL{
		Path:     "/api/v1/db/users",
		RawQuery: "q=test&accessible=true&protected=false&page=1&pageSize=20&sortBy=name&sortOrder=asc",
	}

	req := httptest.NewRequest(http.MethodGet, u.String(), nil)
	rr := httptest.NewRecorder()

	server.handleDBUsers(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBLists_URLQuery(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	u := &url.URL{
		Path:     "/api/v1/db/lists",
		RawQuery: "q=test&ownerId=100&page=1&pageSize=20",
	}

	req := httptest.NewRequest(http.MethodGet, u.String(), nil)
	rr := httptest.NewRecorder()

	server.handleDBLists(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserEntities_URLQuery(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	u := &url.URL{
		Path:     "/api/v1/db/user-entities",
		RawQuery: "q=test&userId=1&page=1&pageSize=20",
	}

	req := httptest.NewRequest(http.MethodGet, u.String(), nil)
	rr := httptest.NewRecorder()

	server.handleDBUserEntities(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBListEntities_URLQuery(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	u := &url.URL{
		Path:     "/api/v1/db/list-entities",
		RawQuery: "q=test&listId=1&page=1&pageSize=20",
	}

	req := httptest.NewRequest(http.MethodGet, u.String(), nil)
	rr := httptest.NewRecorder()

	server.handleDBListEntities(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleDBUserLinks_URLQuery(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	u := &url.URL{
		Path:     "/api/v1/db/user-links",
		RawQuery: "userId=1&listEntityId=1&page=1&pageSize=20",
	}

	req := httptest.NewRequest(http.MethodGet, u.String(), nil)
	rr := httptest.NewRecorder()

	server.handleDBUserLinks(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

// TestWriteEntityMutationErrorTranslatesDatabaseSentinel 守护单哨兵契约：
// 直连 database 的调用点（如 UpdateUserEntityMetadata 在并发删除后）返回裸
// database.ErrEntityNotFound，经 writeEntityMutationError 的 TranslateError
// 收口后必须映射 404 而非落入 default 变 500。
func TestWriteEntityMutationErrorTranslatesDatabaseSentinel(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	raw := fmt.Errorf("%w: user entity 42", database.ErrEntityNotFound)
	rr := httptest.NewRecorder()

	server.writeEntityMutationError(rr, raw, "Entity", "Entity directory already exists", "UpdateUserEntityMetadata")

	assert.Equal(t, http.StatusNotFound, rr.Code)
	assert.Contains(t, rr.Body.String(), `"success":false`)
}

// TestWriteEntityMutationErrorIdempotentTranslation entity 层已翻译的错误
// 再次经过 TranslateError 保持单哨兵不变。
func TestWriteEntityMutationErrorIdempotentTranslation(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	translated := entitypkg.TranslateError(fmt.Errorf("%w: user entity 42", database.ErrEntityNotFound))
	if !errors.Is(translated, entitypkg.ErrNotFound) {
		t.Fatalf("precondition: translated error should match entity.ErrNotFound")
	}
	rr := httptest.NewRecorder()

	server.writeEntityMutationError(rr, translated, "Entity", "Entity directory already exists", "UpdateUserEntityMetadata")

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
