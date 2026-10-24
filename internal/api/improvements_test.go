package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/service"
)

func TestHandleDownloadContext_ReportsReadiness(t *testing.T) {
	t.Run("auth disabled counts as authenticated", func(t *testing.T) {
		server, db := newHandlerServer(t)
		defer db.Close()

		rr := httptest.NewRecorder()
		server.handleDownloadContext(rr, httptest.NewRequest(http.MethodGet, "/api/v1/download/context", nil))

		var resp DownloadContextResponse
		decodeEnvelope(t, rr, &resp)
		assert.False(t, resp.AuthEnabled)
		assert.True(t, resp.Authenticated)
		assert.False(t, resp.CookieConfigured)
		assert.True(t, resp.DBReady)
		require.NotNil(t, resp.TaskStats)
		assert.Equal(t, 5, resp.MaxDownloadRoutine)
	})

	t.Run("auth enabled hides privileged fields without token", func(t *testing.T) {
		server, db := newHandlerServer(t)
		defer db.Close()
		server.config.APIKey = "secret-key"

		rr := httptest.NewRecorder()
		server.handleDownloadContext(rr, httptest.NewRequest(http.MethodGet, "/api/v1/download/context", nil))

		var resp DownloadContextResponse
		decodeEnvelope(t, rr, &resp)
		assert.True(t, resp.AuthEnabled)
		assert.False(t, resp.Authenticated)
		assert.Nil(t, resp.TaskStats)
		assert.Zero(t, resp.MaxDownloadRoutine)
	})

	t.Run("raw api key authenticates and counts cookie accounts", func(t *testing.T) {
		server, db := newHandlerServer(t)
		defer db.Close()
		server.config.APIKey = "secret-key"
		server.config.Cookie.AuthToken = "token-value"

		cookiePath := filepath.Join(server.appRootPath, "additional_cookies.yaml")
		require.NoError(t, config.WriteAdditionalCookies(cookiePath, []*config.Cookie{
			{AuthToken: "a", Ct0: "b"},
			{AuthToken: "c", Ct0: "d"},
		}))

		req := httptest.NewRequest(http.MethodGet, "/api/v1/download/context", nil)
		req.Header.Set("Authorization", "Bearer secret-key")
		rr := httptest.NewRecorder()
		server.handleDownloadContext(rr, req)

		var resp DownloadContextResponse
		decodeEnvelope(t, rr, &resp)
		assert.True(t, resp.Authenticated)
		assert.True(t, resp.CookieConfigured)
		assert.Equal(t, 2, resp.AdditionalCookieAccounts)
		assert.NotNil(t, resp.TaskStats)
		assert.False(t, resp.ServerShuttingDown)
	})

	t.Run("query token works for SSE-style clients", func(t *testing.T) {
		server, db := newHandlerServer(t)
		defer db.Close()
		server.config.APIKey = "secret-key"

		rr := httptest.NewRecorder()
		server.handleDownloadContext(rr, httptest.NewRequest(http.MethodGet, "/api/v1/download/context?token=secret-key", nil))

		var resp DownloadContextResponse
		decodeEnvelope(t, rr, &resp)
		assert.True(t, resp.Authenticated)
	})
}

func TestDownloadContextIsPublicUnderAuth(t *testing.T) {
	server, db := setupTestServer(t)
	defer db.Close()
	server.config.APIKey = "secret-key"

	handler := server.buildHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/download/context", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp DownloadContextResponse
	decodeEnvelope(t, rr, &resp)
	assert.True(t, resp.AuthEnabled)
	assert.False(t, resp.Authenticated)
}

func TestHandleTasksQuery_FiltersSortsAndPaginates(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	failed := server.taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "alice"})
	require.True(t, server.taskManager.SetTaskError(failed.ID, errors.New("rate limited")))

	completed := server.taskManager.CreateTask(TaskTypeProfileDownload, &ProfileDownloadTaskData{ScreenName: "bob"})
	require.True(t, server.taskManager.CompleteTask(completed.ID, &TaskResult{Message: "done"}))

	queued := server.taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "carol"})

	t.Run("no filter returns all", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query", nil))

		var resp TasksQueryResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 3, resp.Total)
		assert.Equal(t, 1, resp.Page)
		assert.Equal(t, tasksQueryDefaultPageSize, resp.PageSize)
		assert.Len(t, resp.Items, 3)
	})

	t.Run("status filter", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?status=failed", nil))

		var resp TasksQueryResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)
		assert.Equal(t, failed.ID, resp.Items[0].ID)
	})

	t.Run("multi status filter", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?status=failed,queued", nil))

		var resp TasksQueryResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 2, resp.Total)
	})

	t.Run("type filter", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?type=profile_download", nil))

		var resp TasksQueryResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)
		assert.Equal(t, completed.ID, resp.Items[0].ID)
	})

	t.Run("keyword matches target and error", func(t *testing.T) {
		for _, keyword := range []string{"alice", "rate", "bob"} {
			rr := httptest.NewRecorder()
			server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?q="+keyword, nil))

			var resp TasksQueryResponse
			decodeEnvelope(t, rr, &resp)
			assert.Equal(t, 1, resp.Total, "keyword %q", keyword)
		}
	})

	t.Run("pagination caps and counts", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?page=2&pageSize=1", nil))

		var resp TasksQueryResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 3, resp.Total)
		assert.Equal(t, 3, resp.TotalPages)
		assert.Equal(t, 2, resp.Page)
		assert.Len(t, resp.Items, 1)

		rr = httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?pageSize=5000", nil))
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, tasksQueryMaxPageSize, resp.PageSize)
	})

	t.Run("sort by status ascending", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?sortBy=status&sortOrder=asc", nil))

		var resp TasksQueryResponse
		decodeEnvelope(t, rr, &resp)
		require.Len(t, resp.Items, 3)
		for i := 1; i < len(resp.Items); i++ {
			assert.LessOrEqual(t, string(resp.Items[i-1].Status), string(resp.Items[i].Status))
		}
	})

	t.Run("stage filter", func(t *testing.T) {
		downloading := server.taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "dave"})
		require.True(t, server.taskManager.UpdateTaskProgress(downloading.ID, &TaskProgress{
			Stage: "downloading", Total: 10, Completed: 2, Current: "dave",
		}))

		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?stage=downloading", nil))

		var resp TasksQueryResponse
		decodeEnvelope(t, rr, &resp)
		require.Equal(t, 1, resp.Total)
		assert.Equal(t, downloading.ID, resp.Items[0].ID)

		rr = httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?stage=downloading,retrying", nil))
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Total)

		rr = httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?stage=downloading&status=failed", nil))
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 0, resp.Total)
	})

	t.Run("unknown filter values rejected", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?status=bogus", nil))
		assert.Equal(t, http.StatusBadRequest, rr.Code)

		rr = httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?type=bogus", nil))
		assert.Equal(t, http.StatusBadRequest, rr.Code)

		rr = httptest.NewRecorder()
		server.handleTasksQuery(rr, httptest.NewRequest(http.MethodGet, "/api/v1/tasks/query?stage=bogus", nil))
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	_ = queued
}

func requestWithAction(method, target, action string, body string) *http.Request {
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	req.SetPathValue("action", action)
	return req
}

func TestHandleBatchTask_HandlesMixedOutcomes(t *testing.T) {
	server, db := setupTestServer(t)
	defer db.Close()
	server.config.APIKey = ""

	failed := server.taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "alice"})
	require.True(t, server.taskManager.SetTaskError(failed.ID, errors.New("boom")))

	queued := server.taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{ScreenName: "bob"})

	t.Run("retry reports per-task outcome", func(t *testing.T) {
		body := fmt.Sprintf(`{"task_ids":["%s","task_missing"]}`, failed.ID)
		rr := httptest.NewRecorder()
		server.handleBatchTask(rr, requestWithAction(http.MethodPost, "/api/v1/tasks/batch/retry", "retry", body))

		var resp BatchTaskResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Succeeded)
		assert.Equal(t, 1, resp.Failed)
		require.Len(t, resp.Results, 2)
		assert.True(t, resp.Results[0].OK)
		assert.NotEmpty(t, resp.Results[0].NewTaskID)
		assert.Equal(t, "not_found", resp.Results[1].Code)
	})

	t.Run("cancel reports per-task outcome", func(t *testing.T) {
		body := fmt.Sprintf(`{"task_ids":["%s"]}`, queued.ID)
		rr := httptest.NewRecorder()
		server.handleBatchTask(rr, requestWithAction(http.MethodPost, "/api/v1/tasks/batch/cancel", "cancel", body))
		var resp BatchTaskResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Succeeded)
		assert.True(t, resp.Results[0].OK)

		rr = httptest.NewRecorder()
		server.handleBatchTask(rr, requestWithAction(http.MethodPost, "/api/v1/tasks/batch/cancel", "cancel", body))
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 0, resp.Succeeded)
		assert.Equal(t, "not_cancellable", resp.Results[0].Code)
	})

	t.Run("delete reports per-task outcome", func(t *testing.T) {
		body := fmt.Sprintf(`{"task_ids":["%s","task_missing"]}`, failed.ID)
		rr := httptest.NewRecorder()
		server.handleBatchTask(rr, requestWithAction(http.MethodPost, "/api/v1/tasks/batch/delete", "delete", body))

		var resp BatchTaskResponse
		decodeEnvelope(t, rr, &resp)
		assert.Equal(t, 1, resp.Succeeded)
		assert.Equal(t, "not_found", resp.Results[1].Code)
	})

	t.Run("rejects empty and oversized payloads", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleBatchTask(rr, requestWithAction(http.MethodPost, "/api/v1/tasks/batch/cancel", "cancel", "{}"))
		assert.Equal(t, http.StatusBadRequest, rr.Code)

		ids := make([]string, 0, batchTaskMaxIDs+1)
		for i := 0; i < batchTaskMaxIDs+1; i++ {
			ids = append(ids, "task_x")
		}
		payload, err := json.Marshal(map[string][]string{"task_ids": ids})
		require.NoError(t, err)
		rr = httptest.NewRecorder()
		server.handleBatchTask(rr, requestWithAction(http.MethodPost, "/api/v1/tasks/batch/cancel", "cancel", string(payload)))
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("unknown action rejected", func(t *testing.T) {
		rr := httptest.NewRecorder()
		server.handleBatchTask(rr, requestWithAction(http.MethodPost, "/api/v1/tasks/batch/bogus", "bogus", `{"task_ids":["x"]}`))
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

func TestProgressReporterTruncatesFailedDetails(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	task := server.taskManager.CreateTask(TaskTypeProfileDownload, &ProfileDownloadTaskData{ScreenName: "alice"})
	details := make([]string, 0, maxTaskFailedDetails+10)
	for i := 0; i < maxTaskFailedDetails+10; i++ {
		details = append(details, "user failed")
	}

	reporter := NewSSEProgressReporter(server)
	reporter.OnComplete(task.ID, service.Result{
		Profile:       &service.ProfileResult{Downloaded: 1},
		Message:       "done",
		FailedDetails: details,
	})

	updated, ok := server.taskManager.GetTask(task.ID)
	require.True(t, ok)
	assert.Equal(t, TaskStatusCompleted, updated.Status)
	require.NotNil(t, updated.Result)
	assert.Len(t, updated.Result.FailedDetails, maxTaskFailedDetails)
}

func TestRouteRegistration_NewEndpointsResolve(t *testing.T) {
	server, db := setupTestServer(t)
	defer db.Close()

	cases := []struct {
		method string
		path   string
		status int
	}{
		{http.MethodGet, "/api/v1/download/context", http.StatusOK},
		{http.MethodGet, "/api/v1/tasks/query", http.StatusOK},
		{http.MethodPost, "/api/v1/tasks/batch/cancel", http.StatusBadRequest},
		{http.MethodPost, "/api/v1/tasks/batch/retry", http.StatusBadRequest},
		{http.MethodPost, "/api/v1/tasks/batch/delete", http.StatusBadRequest},
	}
	handler := server.buildHandler()
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader("{}"))
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, tc.status, rr.Code, "%s %s body=%s", tc.method, tc.path, rr.Body.String())
	}
}

func TestHandleDownloadContext_CookiesFileMissing(t *testing.T) {
	server, db := newHandlerServer(t)
	defer db.Close()

	_, err := os.Stat(filepath.Join(server.appRootPath, "additional_cookies.yaml"))
	assert.True(t, os.IsNotExist(err))

	rr := httptest.NewRecorder()
	server.handleDownloadContext(rr, httptest.NewRequest(http.MethodGet, "/api/v1/download/context", nil))

	var resp DownloadContextResponse
	decodeEnvelope(t, rr, &resp)
	assert.Zero(t, resp.AdditionalCookieAccounts)
}
