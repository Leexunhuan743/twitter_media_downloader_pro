package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/utils"
)

const (
	tasksQueryDefaultPageSize = 20
	tasksQueryMaxPageSize     = 200
	batchTaskMaxIDs           = 100
)

// DownloadContextResponse 下载页首屏就绪状态聚合。
// 未认证时只暴露布尔与版本，认证后才附带队列、并发与任务统计。
type DownloadContextResponse struct {
	Version                  string               `json:"version"`
	AuthEnabled              bool                 `json:"auth_enabled"`
	Authenticated            bool                 `json:"authenticated"`
	APIKeyConfigured         bool                 `json:"api_key_configured"`
	CookieConfigured         bool                 `json:"cookie_configured"`
	AdditionalCookieAccounts int                  `json:"additional_cookie_accounts"`
	ServerShuttingDown       bool                 `json:"server_shutting_down"`
	Queue                    *QueueStatusResponse `json:"queue,omitempty"`
	MaxDownloadRoutine       int                  `json:"max_download_routine,omitempty"`
	MaxUserFetchConcurrent   int                  `json:"max_user_fetch_concurrent,omitempty"`
	MaxFileNameLen           int                  `json:"max_file_name_len,omitempty"`
	DBReady                  bool                 `json:"db_ready,omitempty"`
	TaskStats                *TaskStatsResponse   `json:"task_stats,omitempty"`
}

// handleDownloadContext 聚合下载页首屏需要的状态，避免前端依赖多个请求与 401 推断。
func (s *Server) handleDownloadContext(w http.ResponseWriter, r *http.Request) {
	s.configMu.RLock()
	apiKey := s.config.APIKey
	cookieConfigured := s.config.Cookie.AuthToken != ""
	maxDownloadRoutine := s.config.MaxDownloadRoutine
	maxUserFetchConcurrent := s.config.MaxUserFetchConcurrent
	maxFileNameLen := s.config.MaxFileNameLen
	s.configMu.RUnlock()

	token := extractBearerToken(r)
	if token == "" {
		token = r.URL.Query().Get("token")
	}

	resp := DownloadContextResponse{
		Version:          buildVersion(),
		AuthEnabled:      apiKey != "",
		APIKeyConfigured: apiKey != "",
		CookieConfigured: cookieConfigured,
	}

	switch {
	case apiKey == "":
		resp.Authenticated = true
	case token == apiKey:
		resp.Authenticated = true
	default:
		if token != "" {
			if jwtToken, err := validateSessionToken(token, apiKey); err == nil && jwtToken != nil && jwtToken.Valid {
				resp.Authenticated = true
			}
		}
	}

	s.lifecycleMu.Lock()
	resp.ServerShuttingDown = s.shuttingDown
	s.lifecycleMu.Unlock()

	if !resp.Authenticated {
		s.writeJSON(w, http.StatusOK, NewSuccessResponse(resp))
		return
	}

	if cookies, err := config.ReadAdditionalCookies(s.additionalCookiesPath()); err == nil {
		resp.AdditionalCookieAccounts = len(cookies)
	}

	if s.downloadQueue != nil {
		pending, active, detached := s.downloadQueue.Status()
		resp.Queue = &QueueStatusResponse{
			QueueDepth:   pending + active + detached,
			ActiveJobs:   active,
			PendingJobs:  pending,
			DetachedJobs: detached,
		}
	}

	if maxDownloadRoutine == 0 {
		maxDownloadRoutine = config.DefaultMaxDownloadRoutine()
	}
	if maxUserFetchConcurrent == 0 {
		maxUserFetchConcurrent = config.DefaultMaxUserFetchConcurrent()
	}
	if maxFileNameLen == 0 {
		maxFileNameLen = utils.DefaultMaxFileNameLen
	}
	resp.MaxDownloadRoutine = maxDownloadRoutine
	resp.MaxUserFetchConcurrent = maxUserFetchConcurrent
	resp.MaxFileNameLen = maxFileNameLen

	if s.db != nil {
		resp.DBReady = s.db.Ping() == nil
	}

	if s.taskManager != nil {
		stats := s.taskManager.GetTaskStats()
		resp.TaskStats = &stats
	}

	s.writeJSON(w, http.StatusOK, NewSuccessResponse(resp))
}

func (s *Server) additionalCookiesPath() string {
	return s.appRootPath + "/additional_cookies.yaml"
}

// TasksQueryResponse 服务端过滤分页后的任务列表。
type TasksQueryResponse struct {
	Items      []*Task `json:"items"`
	Total      int     `json:"total"`
	Page       int     `json:"page"`
	PageSize   int     `json:"pageSize"`
	TotalPages int     `json:"totalPages"`
}

// handleTasksQuery 提供任务列表的服务端过滤、搜索、排序与分页。
func (s *Server) handleTasksQuery(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	statuses, ok := parseTaskStatusFilter(query.Get("status"))
	if !ok {
		s.writeError(w, http.StatusBadRequest, "Invalid status filter")
		return
	}
	types, ok := parseTaskTypeFilter(query.Get("type"))
	if !ok {
		s.writeError(w, http.StatusBadRequest, "Invalid type filter")
		return
	}
	stages, ok := parseTaskStageFilter(query.Get("stage"))
	if !ok {
		s.writeError(w, http.StatusBadRequest, "Invalid stage filter")
		return
	}

	page := parseIntQuery(query.Get("page"), 1)
	if page < 1 {
		page = 1
	}
	pageSize := parseIntQuery(query.Get("pageSize"), tasksQueryDefaultPageSize)
	if pageSize < 1 {
		pageSize = tasksQueryDefaultPageSize
	}
	if pageSize > tasksQueryMaxPageSize {
		pageSize = tasksQueryMaxPageSize
	}

	keyword := strings.ToLower(strings.TrimSpace(query.Get("q")))
	tasks := s.taskManager.GetAllTasks()

	filtered := make([]*Task, 0, len(tasks))
	for _, task := range tasks {
		if len(statuses) > 0 {
			if _, ok := statuses[task.Status]; !ok {
				continue
			}
		}
		if len(types) > 0 {
			if _, ok := types[task.Type]; !ok {
				continue
			}
		}
		if len(stages) > 0 {
			stage := ""
			if task.Progress != nil {
				stage = task.Progress.Stage
			}
			if _, ok := stages[stage]; !ok {
				continue
			}
		}
		if keyword != "" && !taskMatchesKeyword(task, keyword) {
			continue
		}
		filtered = append(filtered, task)
	}

	sortBy := strings.ToLower(strings.TrimSpace(query.Get("sortBy")))
	if !isTaskSortField(sortBy) {
		sortBy = "created_at"
	}
	asc := strings.EqualFold(strings.TrimSpace(query.Get("sortOrder")), "asc")
	sortTasks(filtered, sortBy, asc)

	total := len(filtered)
	totalPages := 0
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}

	s.writeJSON(w, http.StatusOK, NewSuccessResponse(TasksQueryResponse{
		Items:      filtered[start:end],
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}))
}

func parseIntQuery(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func parseTaskStatusFilter(raw string) (map[TaskStatus]struct{}, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, true
	}
	valid := map[TaskStatus]struct{}{
		TaskStatusQueued:    {},
		TaskStatusRunning:   {},
		TaskStatusCompleted: {},
		TaskStatusFailed:    {},
		TaskStatusCancelled: {},
	}
	result := make(map[TaskStatus]struct{})
	for _, part := range strings.Split(raw, ",") {
		value := TaskStatus(strings.TrimSpace(part))
		if value == "" {
			continue
		}
		if _, ok := valid[value]; !ok {
			return nil, false
		}
		result[value] = struct{}{}
	}
	return result, true
}

// parseTaskStageFilter 按进度阶段过滤。阶段来自 TaskProgress.Stage，只有运行中的
// 任务会持续更新；排队任务没有阶段，因此不会命中任何具体阶段。
func parseTaskStageFilter(raw string) (map[string]struct{}, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, true
	}
	valid := make(map[string]struct{}, len(taskStages))
	for _, stage := range taskStages {
		valid[string(stage)] = struct{}{}
	}
	result := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		value := strings.ToLower(strings.TrimSpace(part))
		if value == "" {
			continue
		}
		if _, ok := valid[value]; !ok {
			return nil, false
		}
		result[value] = struct{}{}
	}
	return result, true
}

func parseTaskTypeFilter(raw string) (map[TaskType]struct{}, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, true
	}
	valid := map[TaskType]struct{}{
		TaskTypeUserDownload:       {},
		TaskTypeListDownload:       {},
		TaskTypeFollowingDownload:  {},
		TaskTypeProfileDownload:    {},
		TaskTypeMarkDownloaded:     {},
		TaskTypeJsonFileDownload:   {},
		TaskTypeJsonFolderDownload: {},
		TaskTypeBatchDownload:      {},
		TaskTypeListProfile:        {},
		TaskTypeRetryAllFailed:     {},
	}
	result := make(map[TaskType]struct{})
	for _, part := range strings.Split(raw, ",") {
		value := TaskType(strings.TrimSpace(part))
		if value == "" {
			continue
		}
		if _, ok := valid[value]; !ok {
			return nil, false
		}
		result[value] = struct{}{}
	}
	return result, true
}

func isTaskSortField(field string) bool {
	switch field {
	case "created_at", "ended_at", "started_at", "status", "type":
		return true
	default:
		return false
	}
}

func sortTasks(tasks []*Task, sortBy string, asc bool) {
	less := func(a, b *Task) bool {
		switch sortBy {
		case "ended_at":
			return timePtrBefore(a.EndedAt, b.EndedAt, asc)
		case "started_at":
			return timePtrBefore(a.StartedAt, b.StartedAt, asc)
		case "status":
			if a.Status == b.Status {
				return createdAtLess(a, b, asc)
			}
			if asc {
				return a.Status < b.Status
			}
			return a.Status > b.Status
		case "type":
			if a.Type == b.Type {
				return createdAtLess(a, b, asc)
			}
			if asc {
				return a.Type < b.Type
			}
			return a.Type > b.Type
		default:
			return createdAtLess(a, b, asc)
		}
	}
	sort.SliceStable(tasks, func(i, j int) bool { return less(tasks[i], tasks[j]) })
}

func createdAtLess(a, b *Task, asc bool) bool {
	if asc {
		return a.CreatedAt.Before(b.CreatedAt)
	}
	return a.CreatedAt.After(b.CreatedAt)
}

func timePtrBefore(a, b *time.Time, asc bool) bool {
	var at, bt time.Time
	if a != nil {
		at = *a
	}
	if b != nil {
		bt = *b
	}
	switch {
	case at.IsZero() && bt.IsZero():
		return false
	case at.IsZero():
		return !asc
	case bt.IsZero():
		return asc
	}
	if asc {
		return at.Before(bt)
	}
	return at.After(bt)
}

func taskMatchesKeyword(task *Task, keyword string) bool {
	if strings.Contains(strings.ToLower(task.ID), keyword) {
		return true
	}
	if strings.Contains(strings.ToLower(task.Error), keyword) {
		return true
	}
	if task.Result != nil && strings.Contains(strings.ToLower(task.Result.Message), keyword) {
		return true
	}
	if task.Data == nil {
		return false
	}
	encoded, err := json.Marshal(task.Data)
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(encoded)), keyword)
}

// BatchTaskRequest 批量任务操作请求。
type BatchTaskRequest struct {
	TaskIDs []string `json:"task_ids"`
}

// BatchTaskItemResult 单条任务的操作结果。
type BatchTaskItemResult struct {
	TaskID    string `json:"task_id"`
	OK        bool   `json:"ok"`
	Code      string `json:"code,omitempty"`
	NewTaskID string `json:"new_task_id,omitempty"`
}

// BatchTaskResponse 批量任务操作响应。
type BatchTaskResponse struct {
	Succeeded int                   `json:"succeeded"`
	Failed    int                   `json:"failed"`
	Results   []BatchTaskItemResult `json:"results"`
}

// handleBatchTask 对一批任务执行 cancel/retry/delete，逐条返回结果。
func (s *Server) handleBatchTask(w http.ResponseWriter, r *http.Request) {
	// 路由以静态路径注册（避免与 /tasks/{task_id}/... 的模式冲突），动作从路径尾段取。
	action := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/tasks/batch/"), "/")
	switch action {
	case "cancel", "retry", "delete":
	default:
		s.writeError(w, http.StatusNotFound, "Unknown batch action")
		return
	}

	var req BatchTaskRequest
	s.limitJSONBody(w, r, defaultJSONBodyLimit)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		if s.writeBodyTooLarge(w, err) {
			return
		}
		s.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(req.TaskIDs) == 0 {
		s.writeError(w, http.StatusBadRequest, "task_ids is required")
		return
	}
	if len(req.TaskIDs) > batchTaskMaxIDs {
		s.writeError(w, http.StatusBadRequest, "Too many task_ids (max 100)")
		return
	}

	resp := BatchTaskResponse{Results: make([]BatchTaskItemResult, 0, len(req.TaskIDs))}
	wakeup := false
	for _, taskID := range req.TaskIDs {
		item := BatchTaskItemResult{TaskID: taskID}
		switch action {
		case "cancel":
			switch s.taskManager.CancelTask(taskID) {
			case CancelTaskResultCancelled:
				item.OK = true
				wakeup = true
			case CancelTaskResultNotFound:
				item.Code = "not_found"
			default:
				item.Code = "not_cancellable"
			}
		case "delete":
			switch s.taskManager.DeleteTask(taskID) {
			case DeleteTaskResultDeleted:
				item.OK = true
			case DeleteTaskResultNotFound:
				item.Code = "not_found"
			default:
				item.Code = "not_deletable"
			}
		case "retry":
			newTaskID, code := s.retryTask(taskID)
			if code == "" {
				item.OK = true
				item.NewTaskID = newTaskID
			} else {
				item.Code = code
			}
		}
		if item.OK {
			resp.Succeeded++
		} else {
			resp.Failed++
		}
		resp.Results = append(resp.Results, item)
	}

	if wakeup && s.downloadQueue != nil {
		s.downloadQueue.Wakeup()
	}

	s.writeJSON(w, http.StatusOK, NewSuccessResponse(resp))
}

// retryTask 重建并重试一条失败/取消的任务，返回新任务 ID 或失败码。
func (s *Server) retryTask(taskID string) (string, string) {
	original, ok := s.taskManager.GetTask(taskID)
	if !ok {
		return "", "not_found"
	}
	if original.Status != TaskStatusFailed && original.Status != TaskStatusCancelled {
		return "", "not_retryable"
	}
	if d, ok := original.Data.(*JsonFileDownloadTaskData); ok && d.FromUpload {
		return "", "not_retryable_upload"
	}
	if d, ok := original.Data.(*JsonFolderDownloadTaskData); ok && d.FromUpload {
		return "", "not_retryable_upload"
	}

	runFunc, err := s.buildTaskRunFunc(original)
	if err != nil {
		log.Errorf("[tasks] Run function build failed task_id=%s type=%s error=%q", original.ID, original.Type, err.Error())
		return "", "invalid_task"
	}

	newTask, result := s.taskManager.RetryTask(taskID)
	switch result {
	case RetryTaskResultSuccess:
		if err := s.enqueueTask(newTask, runFunc); err != nil {
			if errors.Is(err, ErrQueueClosed) {
				return "", "queue_closed"
			}
			return "", "enqueue_failed"
		}
		return newTask.ID, ""
	case RetryTaskResultNotFound:
		return "", "not_found"
	case RetryTaskResultNotRetryable:
		return "", "not_retryable"
	default:
		return "", "retry_failed"
	}
}
