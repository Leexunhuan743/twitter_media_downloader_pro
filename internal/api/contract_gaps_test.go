package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
	"github.com/unkmonster/tmd/internal/database"
)

// decodeEnvelope 解析统一响应信封，并把 data 反序列化到 dest（dest 为 nil 时只校验成功）。
func decodeEnvelope(t *testing.T, rr *httptest.ResponseRecorder, dest interface{}) {
	t.Helper()
	var env struct {
		Success bool            `json:"success"`
		Data    json.RawMessage `json:"data"`
		Error   string          `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &env))
	require.True(t, env.Success, "expected success response, got error %q", env.Error)
	if dest != nil {
		require.NoError(t, json.Unmarshal(env.Data, dest))
	}
}

// newHandlerServer 构造只依赖 db/config/日志 Hub 的服务器，appRootPath 指向临时目录。
func newHandlerServer(t *testing.T) (*Server, *sqlx.DB) {
	t.Helper()
	db := setupTestDB(t)
	server := &Server{
		db:          db,
		config:      &config.Config{RootPath: t.TempDir(), MaxDownloadRoutine: 5, MaxFileNameLen: 100},
		appRootPath: t.TempDir(),
		logHub:      consolelog.NewHub(1000),
		taskManager: NewTaskManager(nil),
	}
	t.Cleanup(server.taskManager.Close)
	return server, db
}

// itoa 把数据库主键转成路径参数用的十进制字符串。
func itoa(id int32) string { return strconv.FormatInt(int64(id), 10) }

// requestWithID 构造带路径参数 id 的请求（等价于 ServeMux 解析后的 PathValue）。
func requestWithID(method, target, id string, body io.Reader) *http.Request {
	req := httptest.NewRequest(method, target, body)
	req.SetPathValue("id", id)
	return req
}

func TestHandleGetLogs_FiltersByLevelAndDomain(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	server.logHub.Add("INFO[2024-06-04T10:00:00+08:00] [download] started")
	server.logHub.Add("ERRO[2024-06-04T10:00:01+08:00] [download] failed")
	server.logHub.Add("WARN[2024-06-04T10:00:02+08:00] [scheduler] slow")
	server.logHub.Add("INFO[2024-06-04T10:00:03+08:00] [api] served")

	t.Run("all lines newest first", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleGetLogs(rr, httptest.NewRequest(http.MethodGet, "/api/v1/logs", nil))

		var resp LogsResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 4, resp.Total)
		assert.Len(t, resp.Logs, 4)
		assert.Contains(t, resp.Logs[0], "[api]")
	})

	t.Run("level filter", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleGetLogs(rr, httptest.NewRequest(http.MethodGet, "/api/v1/logs?level=error", nil))

		var resp LogsResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)
		assert.Contains(t, resp.Logs[0], "failed")
	})

	t.Run("domain and search filter", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleGetLogs(rr, httptest.NewRequest(http.MethodGet, "/api/v1/logs?domain=scheduler&q=slow", nil))

		var resp LogsResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)
	})

	t.Run("time window filter", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleGetLogs(rr, httptest.NewRequest(http.MethodGet,
			"/api/v1/logs?start_time=2024-06-04T10:00:01%2B08:00&end_time=2024-06-04T10:00:02%2B08:00", nil))

		var resp LogsResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 2, resp.Total)
		for _, line := range resp.Logs {
			assert.NotContains(t, line, "[api]")
		}
	})
}

func TestHandleLogStats_CountsLevels(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	server.logHub.Add("INFO[2024-06-04T10:00:00+08:00] [api] a")
	server.logHub.Add("INFO[2024-06-04T10:00:01+08:00] [api] b")
	server.logHub.Add("WARN[2024-06-04T10:00:02+08:00] [api] c")
	server.logHub.Add("ERRO[2024-06-04T10:00:03+08:00] [api] d")
	server.logHub.Add("FATA[2024-06-04T10:00:04+08:00] [api] e")

	rr := httptest.NewRecorder()
	server.handleLogStats(rr, httptest.NewRequest(http.MethodGet, "/api/v1/logs/stats", nil))

	var stats map[string]int
	decodeEnvelope(t, rr, &stats)
	assert.Equal(t, 5, stats["total"])
	assert.Equal(t, 2, stats["info"])
	assert.Equal(t, 1, stats["warn"])
	assert.Equal(t, 2, stats["error"])
}

func TestHandleLogExport_StreamsFileAndReportsMissing(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	t.Run("missing file", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleLogExport(rr, httptest.NewRequest(http.MethodGet, "/api/v1/logs/export", nil))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)
	})

	t.Run("existing file", func(t *testing.T) {
		path := filepath.Join(server.appRootPath, "tmd2.log")
		require.NoError(t, os.WriteFile(path, []byte("line one\nline two\n"), 0o600))

		rr := httptest.NewRecorder()
		server.handleLogExport(rr, httptest.NewRequest(http.MethodGet, "/api/v1/logs/export", nil))

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Header().Get("Content-Disposition"), "tmd2-")
		assert.Equal(t, "line one\nline two\n", rr.Body.String())
	})
}

func TestHandleQueueStatus_ReportsCounters(t *testing.T) {
	server, db := setupTestServer(t)
	defer db.Close()

	rr := httptest.NewRecorder()
	server.handleQueueStatus(rr, httptest.NewRequest(http.MethodGet, "/api/v1/queue/status", nil))

	var resp QueueStatusResponse
	decodeEnvelope(t, rr, &resp)
	assert.GreaterOrEqual(t, resp.QueueDepth, 0)
	assert.Equal(t, resp.PendingJobs+resp.ActiveJobs+resp.DetachedJobs, resp.QueueDepth)

	nilQueue := &Server{taskManager: NewTaskManager(nil)}
	t.Cleanup(nilQueue.taskManager.Close)
	rr = httptest.NewRecorder()
	nilQueue.handleQueueStatus(rr, httptest.NewRequest(http.MethodGet, "/api/v1/queue/status", nil))

	var empty QueueStatusResponse
	decodeEnvelope(t, rr, &empty)
	assert.Equal(t, QueueStatusResponse{}, empty)
}

func TestHandleDBStats_CountsTables(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()

	require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "u1", Name: "U1", IsAccessible: true}))
	require.NoError(t, database.CreateLst(db, &database.Lst{Id: 100, Name: "L1", OwnerUserId: 1}))

	rr := httptest.NewRecorder()
	server.handleDBStats(rr, httptest.NewRequest(http.MethodGet, "/api/v1/db/stats", nil))

	var stats map[string]int
	decodeEnvelope(t, rr, &stats)
	assert.Equal(t, 1, stats["users"])
	assert.Equal(t, 1, stats["lsts"])
	assert.Equal(t, 0, stats["user_links"])
	assert.Contains(t, stats, "user_previous_names")
}

// seedUserLinkData 建两名用户、一个列表及列表实体，并在实体下挂一条用户链接。
func seedUserLinkData(t *testing.T, db *sqlx.DB) (*database.LstEntity, []*database.UserLink) {
	t.Helper()
	require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "u1", Name: "U1", IsAccessible: true}))
	require.NoError(t, database.CreateUser(db, &database.User{Id: 2, ScreenName: "u2", Name: "U2", IsAccessible: true}))
	require.NoError(t, database.CreateLst(db, &database.Lst{Id: 100, Name: "L1", OwnerUserId: 1}))

	lstEnt := &database.LstEntity{LstId: 100, Name: "members", ParentDir: t.TempDir()}
	require.NoError(t, database.CreateLstEntity(db, lstEnt))

	link := &database.UserLink{UserId: 1, Name: "u1", ParentLstEntityId: database.NullInt32(lstEnt.Id)}
	require.NoError(t, database.CreateUserLink(db, link))
	return lstEnt, []*database.UserLink{link}
}

func TestHandleDBUserLinkDetailAndUpdate(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	_, links := seedUserLinkData(t, db)
	link := links[0]

	t.Run("detail", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleDBUserLinkDetail(rr, requestWithID(http.MethodGet, "/api/v1/db/user-links/1", itoa(link.Id), nil))

		var item DBUserLinkItem
		decodeEnvelope(t, rr, &item)
		assert.Equal(t, "u1", item.Name)
		assert.Equal(t, "1", item.UserID)
		assert.Equal(t, "members", item.ParentLstEntityName)
	})

	t.Run("not found", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleDBUserLinkDetail(rr, requestWithID(http.MethodGet, "/api/v1/db/user-links/999", "999", nil))
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("invalid id", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleDBUserLinkDetail(rr, requestWithID(http.MethodGet, "/api/v1/db/user-links/x", "x", nil))
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("update name", func(t *testing.T) {
		body := strings.NewReader(`{"name":"renamed"}`)
		req := requestWithID(http.MethodPatch, "/api/v1/db/user-links/"+itoa(link.Id), itoa(link.Id), body)

		rr := httptest.NewRecorder()
		server.handleDBUserLinkUpdate(rr, req)

		var item DBUserLinkItem
		decodeEnvelope(t, rr, &item)
		assert.Equal(t, "renamed", item.Name)

		stored, err := database.GetUserLinkById(db, link.Id)
		require.NoError(t, err)
		assert.Equal(t, "renamed", stored.Name)
	})

	t.Run("update rejects empty name", func(t *testing.T) {
		body := strings.NewReader(`{"name":"   "}`)
		req := requestWithID(http.MethodPatch, "/api/v1/db/user-links/"+itoa(link.Id), itoa(link.Id), body)

		rr := httptest.NewRecorder()
		server.handleDBUserLinkUpdate(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleDBUserLinkDelete_RemovesRow(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	_, links := seedUserLinkData(t, db)

	rr := httptest.NewRecorder()
	server.handleDBUserLinkDelete(rr, requestWithID(http.MethodDelete, "/api/v1/db/user-links/1", itoa(links[0].Id), nil))
	assert.Equal(t, http.StatusOK, rr.Code)

	remaining, err := database.GetUserLinkById(db, links[0].Id)
	assert.NoError(t, err)
	assert.Nil(t, remaining, "deleted link must not be readable")
}

func TestHandleDBSubresourceQueries_ScopeByParent(t *testing.T) {
	server, db := createTestServer(t)
	defer db.Close()
	lstEnt, _ := seedUserLinkData(t, db)
	require.NoError(t, database.CreateUserEntity(db, &database.UserEntity{
		UserId: 1, Name: "media", ParentDir: t.TempDir(),
	}))

	t.Run("user entities", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleDBUserEntitiesByUserID(rr, requestWithID(http.MethodGet, "/api/v1/db/users/1/entities", "1", nil))

		var resp PaginatedResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)
	})

	t.Run("user links", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleDBUserLinksByUserID(rr, requestWithID(http.MethodGet, "/api/v1/db/users/1/links", "1", nil))

		var resp PaginatedResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)
	})

	t.Run("list entities", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleDBLstEntitiesByListID(rr, requestWithID(http.MethodGet, "/api/v1/db/lists/100/entities", "100", nil))

		var resp PaginatedResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)
		assert.Equal(t, int64(100), lstEnt.LstId)
	})

	t.Run("empty parent", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleDBUserLinksByUserID(rr, requestWithID(http.MethodGet, "/api/v1/db/users/2/links", "2", nil))

		var resp PaginatedResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 0, resp.Total)
		assert.Equal(t, 1, resp.TotalPages)
	})
}

func TestHandleGetConfigRaw_MissingFileReturnsDefault(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	rr := httptest.NewRecorder()
	server.handleGetConfigRaw(rr, httptest.NewRequest(http.MethodGet, "/api/v1/config/raw", nil))

	var resp ConfigRawResponse
	decodeEnvelope(t, rr, &resp)
	assert.False(t, resp.Exists)
	assert.NotEmpty(t, resp.Content)
	assert.Equal(t, filepath.Join(server.appRootPath, "conf.yaml"), resp.Path)
}

func TestHandleGetConfigFields_MasksSensitiveValues(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	server.config.Cookie.AuthToken = "0123456789abcdef"
	server.config.Cookie.Ct0 = "ct0-secret-value"

	rr := httptest.NewRecorder()
	server.handleGetConfigFields(rr, httptest.NewRequest(http.MethodGet, "/api/v1/config/fields", nil))

	var resp ConfigFieldsResponse
	decodeEnvelope(t, rr, &resp)
	assert.False(t, resp.Exists)
	require.NotEmpty(t, resp.Fields)

	values := make(map[string]string, len(resp.Fields))
	for _, f := range resp.Fields {
		values[f.Name] = f.Value
		assert.NotEmpty(t, f.Label)
	}
	assert.Equal(t, "012•••def", values["auth_token"])
	assert.Contains(t, values["ct0"], "•••")
}

func TestHandleCookies_MasksSecretsAndReportsRaw(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	t.Run("missing files", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleGetCookiesRaw(rr, httptest.NewRequest(http.MethodGet, "/api/v1/cookies/raw", nil))

		var resp CookiesRawResponse
		decodeEnvelope(t, rr, &resp)
		assert.False(t, resp.Exists)
		assert.Empty(t, resp.Content)
	})

	path := filepath.Join(server.appRootPath, "additional_cookies.yaml")
	require.NoError(t, os.WriteFile(path, []byte("- auth_token: \"0123456789abcdef\"\n  ct0: \"ct0-value-xyz\"\n"), 0o600))

	t.Run("masks secrets", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleGetCookies(rr, httptest.NewRequest(http.MethodGet, "/api/v1/cookies", nil))

		var resp struct {
			Exists bool         `json:"exists"`
			Items  []CookieItem `json:"items"`
		}
		decodeEnvelope(t, rr, &resp)
		require.True(t, resp.Exists)
		require.Len(t, resp.Items, 1)
		assert.Equal(t, "012•••def", resp.Items[0].AuthToken)
		assert.NotContains(t, rr.Body.String(), "0123456789abcdef")
	})

	t.Run("raw content", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleGetCookiesRaw(rr, httptest.NewRequest(http.MethodGet, "/api/v1/cookies/raw", nil))

		var resp CookiesRawResponse
		decodeEnvelope(t, rr, &resp)
		assert.True(t, resp.Exists)
		assert.Contains(t, resp.Path, "additional_cookies.yaml")
		assert.Contains(t, resp.Content, "0123456789abcdef")
	})
}

func TestParseFilterTime_Layouts(t *testing.T) {
	cases := []struct {
		in string
		ok bool
	}{
		{"", false},
		{"not-a-time", false},
		{"2024-06-04T10:00:00Z", true},
		{"2024-06-04T10:00:00+08:00", true},
		{"2024-06-04T10:00:00", true},
		{"2024-06-04", true},
	}
	for _, c := range cases {
		got, ok := parseFilterTime(c.in)
		assert.Equal(t, c.ok, ok, "input %q", c.in)
		if ok {
			assert.False(t, got.IsZero())
		}
	}
}

func TestIsValidLogLevel(t *testing.T) {
	for _, level := range []string{"debug", "info", "warn", "error", "all"} {
		assert.True(t, isValidLogLevel(level), level)
	}
	for _, level := range []string{"", "fatal", "trace", "INFO"} {
		assert.False(t, isValidLogLevel(level), level)
	}
}

func TestFilterLogLinesReverse_PreservesNewestFirstOrder(t *testing.T) {
	lines := []string{
		"INFO[2024-06-04T10:00:00+08:00] [api] first",
		"ERRO[2024-06-04T10:00:01+08:00] [api] second",
		"INFO[2024-06-04T10:00:02+08:00] [api] third",
	}
	got := filterLogLinesReverse(lines, "", "", "", false, time.Time{}, false, time.Time{})
	require.Len(t, got, 3)
	assert.Contains(t, got[0], "third")
	assert.Contains(t, got[2], "first")

	filtered := filterLogLinesReverse(lines, "info", "", "", false, time.Time{}, false, time.Time{})
	require.Len(t, filtered, 2)
	assert.Contains(t, filtered[0], "third")
	assert.Contains(t, filtered[1], "first")
}
