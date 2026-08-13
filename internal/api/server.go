package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/gookit/color"
	"github.com/jmoiron/sqlx"
	"github.com/rs/cors"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/bot"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
	"github.com/unkmonster/tmd/internal/downloading"
	"github.com/unkmonster/tmd/internal/logging"
	"github.com/unkmonster/tmd/internal/scheduler"
	"github.com/unkmonster/tmd/internal/service"
)

const (
	defaultShutdownDrainTimeout = 45 * time.Second
)

type Server struct {
	client            *resty.Client
	additionalClients []*resty.Client
	db                *sqlx.DB
	config            *config.Config
	appRootPath       string
	configMu          sync.RWMutex
	taskManager       *TaskManager
	downloadService   service.DownloadService
	downloadQueue     *DownloadQueue
	logWriter         io.Closer
	logHub            *consolelog.Hub
	bindAddress       string
	httpServer        *http.Server
	lifecycleMu       sync.Mutex
	started           bool
	shuttingDown      bool
	startupDone       chan struct{}
	startedBots       []bot.Bot
	activeMutations   sync.WaitGroup
	shutdownTimeout   time.Duration
	shutdownOnce      sync.Once
	shutdownDone      chan struct{}
	schedulesMu       sync.Mutex
	schedulerMu       sync.RWMutex
	scheduler         *scheduler.Scheduler
	eventBus          *EventBus
	botCallbacks      map[string]http.HandlerFunc
	botCallbackPaths  map[string]struct{}
	bots              []bot.Bot
	authRateLimit     *authRateLimiter
}

func NewServer(client *resty.Client, additionalClients []*resty.Client, db *sqlx.DB, config *config.Config, appRootPath string, logWriter io.Closer) (*Server, error) {
	return NewServerWithConsoleLogHub(client, additionalClients, db, config, appRootPath, logWriter, consolelog.DefaultHub())
}

func NewServerWithConsoleLogHub(client *resty.Client, additionalClients []*resty.Client, db *sqlx.DB, config *config.Config, appRootPath string, logWriter io.Closer, logHub *consolelog.Hub) (*Server, error) {
	if logHub == nil {
		logHub = consolelog.DefaultHub()
	}
	if config == nil {
		return nil, fmt.Errorf("server config is nil")
	}

	eventBus := NewEventBus()

	s := &Server{
		client:            client,
		additionalClients: additionalClients,
		db:                db,
		config:            config,
		appRootPath:       appRootPath,
		logWriter:         logWriter,
		logHub:            logHub,
		taskManager:       NewTaskManager(eventBus),
		shutdownDone:      make(chan struct{}),
		botCallbacks:      make(map[string]http.HandlerFunc),
		botCallbackPaths:  make(map[string]struct{}),
		eventBus:          eventBus,
		authRateLimit: &authRateLimiter{
			attempts: make(map[string]*rateLimitEntry),
			stopCh:   make(chan struct{}),
		},
		shutdownTimeout: defaultShutdownDrainTimeout,
	}

	// 配置副本：使 service.Dependencies 持有独立的 Config 副本，
	// 避免与 Server.config 共享同一指针。这样 handleUpdateConfigRaw
	// 的 *s.config = *testConf 只影响 Server 显示用配置，不影响运行时依赖，
	// 确保所有运行时组件行为一致（均需重启后生效）。
	configCopy := *config
	downloadService, err := service.NewDownloadService(&service.Dependencies{
		Client:            client,
		AdditionalClients: additionalClients,
		DB:                db,
		Config:            &configCopy,
		AppRootPath:       appRootPath,
		ListSyncManager:   downloading.NewListSyncManager(db),
	})
	if err != nil {
		s.taskManager.Close()
		eventBus.Close()
		return nil, fmt.Errorf("download service create failed: %w", err)
	}
	s.downloadService = downloadService
	s.downloadQueue = NewDownloadQueue(s)
	s.authRateLimit.startCleanupLoop()

	schedulesPath := filepath.Join(appRootPath, "schedules.yaml")
	sched, err := scheduler.New(schedulesPath, s.scheduledDownload)
	if err != nil {
		log.Warnf("[scheduler] Initialize failed path=%q error=%q", logging.Path(schedulesPath), err.Error())
	} else {
		sched.OnStatusChange = s.handleScheduleStatusChange
		s.scheduler = sched
	}

	return s, nil
}

func (s *Server) getScheduler() *scheduler.Scheduler {
	s.schedulerMu.RLock()
	defer s.schedulerMu.RUnlock()
	return s.scheduler
}

// InitBot 注入 Bot 列表。在 Start() 之前调用。
func (s *Server) InitBot(bots []bot.Bot) {
	s.bots = bots
}

// RegisterBotCallback 注册 bot 平台的 HTTP 回调路由。在 Start() 之前调用。
// 同步登记公开路径：第三方平台回调（如 Feishu）不带 TMD Bearer，自身用
// verify_token/encrypt_key 校验事件；启用 API Key 后这些精确路径必须免
// TMD 认证。只放行实际注册的回调路径，不放行宽泛 /api/v1/bot/ 前缀。
func (s *Server) RegisterBotCallback(pattern string, handler http.HandlerFunc) {
	if s.botCallbacks == nil {
		s.botCallbacks = make(map[string]http.HandlerFunc)
	}
	s.botCallbacks[pattern] = handler
	// 回调注册先于 Start()（main.go InitBot → Start 顺序），此后只读，
	// 无需加锁。authMiddleware 按精确路径放行已注册回调。
	if s.botCallbackPaths == nil {
		s.botCallbackPaths = make(map[string]struct{})
	}
	s.botCallbackPaths[pattern] = struct{}{}
}

// SetBindAddress 设置 Server 监听地址（Start 前调用）。空值表示监听所有
// 网卡（保持 start-server.bat / Docker 兼容）；显式设置 loopback 可收紧默认
// 安全边界。
func (s *Server) SetBindAddress(addr string) {
	s.bindAddress = addr
}

// serverListenAddr 构造 http.Server 的监听地址。
func serverListenAddr(bindAddress string, port int) string {
	if bindAddress == "" {
		return fmt.Sprintf(":%d", port)
	}
	return net.JoinHostPort(bindAddress, strconv.Itoa(port))
}

// currentAPIKey 读取当前配置中的 API Key（空串表示未启用认证）。
func (s *Server) currentAPIKey() string {
	if s == nil || s.config == nil {
		return ""
	}
	s.configMu.RLock()
	defer s.configMu.RUnlock()
	return s.config.APIKey
}

// shouldWarnUnsafeBind 判断是否需要提示不安全的绑定组合：监听非 loopback
// 且未配置 API Key 时，任意同网段客户端可无认证访问删除/关停接口。
func shouldWarnUnsafeBind(bindAddress, apiKey string) bool {
	if apiKey != "" {
		return false
	}
	switch bindAddress {
	case "127.0.0.1", "::1", "localhost":
		return false
	default:
		return true
	}
}

// TaskManager 返回任务管理器（用于 bot 集成）
func (s *Server) TaskManager() *TaskManager { return s.taskManager }

// EventBus 返回事件总线（用于 bot 集成）
func (s *Server) EventBus() *EventBus { return s.eventBus }

// LogHub 返回控制台日志 Hub（用于 bot 集成）
func (s *Server) LogHub() *consolelog.Hub { return s.logHub }

// DownloadService 返回下载服务（用于 bot 集成）
func (s *Server) DownloadService() service.DownloadService { return s.downloadService }

func (s *Server) buildHandler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/health", s.handleHealth)
	mux.HandleFunc("POST /api/v1/auth/login", s.handleAuthLogin)
	mux.HandleFunc("POST /api/v1/auth/refresh", s.handleAuthRefresh)
	mux.HandleFunc("GET /api/v1/auth/check", s.handleAuthCheck)
	mux.HandleFunc("POST /api/v1/users/{screen_name}/download", s.handleUserDownloadRoute)
	mux.HandleFunc("POST /api/v1/users/{screen_name}/profile", s.handleUserProfileRoute)
	mux.HandleFunc("POST /api/v1/users/{screen_name}/mark", s.handleUserMarkRoute)
	mux.HandleFunc("POST /api/v1/users/{screen_name}/following/download", s.handleFollowingDownloadRoute)
	mux.HandleFunc("POST /api/v1/users/{screen_name}/following/mark", s.handleFollowingMarkRoute)
	mux.HandleFunc("POST /api/v1/lists/{list_id}/download", s.handleListDownloadRoute)
	mux.HandleFunc("POST /api/v1/lists/{list_id}/profile", s.handleListProfileRoute)
	mux.HandleFunc("POST /api/v1/lists/{list_id}/mark", s.handleListMarkRoute)
	mux.HandleFunc("POST /api/v1/json/file/download", s.handleJsonFileDownload)
	mux.HandleFunc("POST /api/v1/json/folder/download", s.handleJsonFolderDownload)
	mux.HandleFunc("POST /api/v1/batch/download", s.handleBatchDownload)
	mux.HandleFunc("POST /api/v1/batch/mark", s.handleBatchMark)
	mux.HandleFunc("GET /api/v1/tasks", s.handleTasks)
	mux.HandleFunc("GET /api/v1/tasks/stats", s.handleTaskStats)
	mux.HandleFunc("GET /api/v1/tasks/{task_id}", s.handleGetTask)
	mux.HandleFunc("POST /api/v1/tasks/{task_id}/cancel", s.handleCancelTask)
	mux.HandleFunc("POST /api/v1/tasks/cancel-queued", s.handleCancelQueuedTasks)
	mux.HandleFunc("POST /api/v1/tasks/{task_id}/retry", s.handleRetryTask)
	mux.HandleFunc("DELETE /api/v1/tasks/{task_id}", s.handleDeleteTask)
	mux.HandleFunc("GET /api/v1/errors", s.handleErrors)
	mux.HandleFunc("POST /api/v1/errors/retry", s.handleRetryAllFailed)
	mux.HandleFunc("DELETE /api/v1/errors", s.handleClearErrors)

	mux.HandleFunc("GET /{$}", s.handleWeb)
	mux.HandleFunc("GET /favicon.ico", s.handleFavicon)
	mux.HandleFunc("GET /tasks", s.handleWeb)
	mux.HandleFunc("GET /data", s.handleWeb)
	mux.HandleFunc("GET /schedules", s.handleWeb)
	mux.HandleFunc("GET /system", s.handleWeb)
	mux.HandleFunc("GET /logs", s.handleWeb)
	mux.HandleFunc("GET /static/{$}", s.handleStatic)
	mux.HandleFunc("GET /static/{path...}", s.handleStatic)
	mux.HandleFunc("GET /api/v1/sse/tasks", s.handleSSETasks)

	mux.HandleFunc("GET /api/v1/db/users", s.handleDBUsers)
	mux.HandleFunc("GET /api/v1/db/users/{id}", s.handleDBUserDetail)
	mux.HandleFunc("PATCH /api/v1/db/users/{id}", s.handleDBUserUpdate)
	mux.HandleFunc("DELETE /api/v1/db/users/{id}", s.handleDBUserDelete)
	mux.HandleFunc("GET /api/v1/db/users/{id}/previous-names", s.handleDBUserPreviousNames)
	mux.HandleFunc("GET /api/v1/db/users/{id}/entities", s.handleDBUserEntitiesByUserID)
	mux.HandleFunc("GET /api/v1/db/users/{id}/links", s.handleDBUserLinksByUserID)

	mux.HandleFunc("GET /api/v1/db/lists", s.handleDBLists)
	mux.HandleFunc("GET /api/v1/db/lists/{id}", s.handleDBListDetail)
	mux.HandleFunc("PATCH /api/v1/db/lists/{id}", s.handleDBListUpdate)
	mux.HandleFunc("DELETE /api/v1/db/lists/{id}", s.handleDBListDelete)
	mux.HandleFunc("GET /api/v1/db/lists/{id}/entities", s.handleDBLstEntitiesByListID)

	mux.HandleFunc("GET /api/v1/db/user-entities", s.handleDBUserEntities)
	mux.HandleFunc("GET /api/v1/db/user-entities/{id}", s.handleDBUserEntityDetail)
	mux.HandleFunc("PATCH /api/v1/db/user-entities/{id}", s.handleDBUserEntityUpdate)
	mux.HandleFunc("DELETE /api/v1/db/user-entities/{id}", s.handleDBUserEntityDelete)

	mux.HandleFunc("GET /api/v1/db/list-entities", s.handleDBListEntities)
	mux.HandleFunc("GET /api/v1/db/list-entities/{id}", s.handleDBListEntityDetail)
	mux.HandleFunc("PATCH /api/v1/db/list-entities/{id}", s.handleDBListEntityUpdate)
	mux.HandleFunc("DELETE /api/v1/db/list-entities/{id}", s.handleDBListEntityDelete)

	mux.HandleFunc("GET /api/v1/db/user-links", s.handleDBUserLinks)
	mux.HandleFunc("GET /api/v1/db/user-links/{id}", s.handleDBUserLinkDetail)
	mux.HandleFunc("PATCH /api/v1/db/user-links/{id}", s.handleDBUserLinkUpdate)
	mux.HandleFunc("DELETE /api/v1/db/user-links/{id}", s.handleDBUserLinkDelete)
	mux.HandleFunc("GET /api/v1/db/user-previous-names", s.handleDBPreviousNames)
	mux.HandleFunc("GET /api/v1/db/stats", s.handleDBStats)

	mux.HandleFunc("GET /api/v1/config/theme", s.handleGetTheme)
	mux.HandleFunc("POST /api/v1/config/theme", s.handleSetTheme)
	mux.HandleFunc("GET /api/v1/config/themes", s.handleGetThemes)
	mux.HandleFunc("GET /api/v1/config", s.handleConfig)
	mux.HandleFunc("GET /api/v1/config/raw", s.handleGetConfigRaw)
	mux.HandleFunc("PUT /api/v1/config/raw", s.handleUpdateConfigRaw)
	mux.HandleFunc("GET /api/v1/config/fields", s.handleGetConfigFields)
	mux.HandleFunc("PUT /api/v1/config/fields", s.handleSaveConfigFields)
	mux.HandleFunc("GET /api/v1/cookies", s.handleGetCookies)
	mux.HandleFunc("PUT /api/v1/cookies", s.handleSaveCookies)
	mux.HandleFunc("GET /api/v1/cookies/raw", s.handleGetCookiesRaw)
	mux.HandleFunc("PUT /api/v1/cookies/raw", s.handleUpdateCookiesRaw)
	mux.HandleFunc("POST /api/v1/server/shutdown", s.handleServerShutdown)
	mux.HandleFunc("GET /api/v1/queue/status", s.handleQueueStatus)
	mux.HandleFunc("GET /api/v1/logs", s.handleGetLogs)
	mux.HandleFunc("GET /api/v1/logs/stats", s.handleLogStats)
	mux.HandleFunc("GET /api/v1/logs/export", s.handleLogExport)
	mux.HandleFunc("GET /api/v1/logs/stream", s.handleLogStream)

	mux.HandleFunc("GET /api/v1/schedules", s.handleGetSchedules)
	mux.HandleFunc("PUT /api/v1/schedules", s.handleReplaceSchedules)
	mux.HandleFunc("POST /api/v1/schedules", s.handleCreateSchedule)
	mux.HandleFunc("GET /api/v1/schedules/raw", s.handleGetSchedulesRaw)
	mux.HandleFunc("PUT /api/v1/schedules/raw", s.handleUpdateSchedulesRaw)
	mux.HandleFunc("POST /api/v1/schedules/reload", s.handleReloadSchedules)
	mux.HandleFunc("POST /api/v1/schedules/validate", s.handleValidateSchedule)
	mux.HandleFunc("POST /api/v1/schedules/trigger-all", s.handleTriggerAllSchedules)
	mux.HandleFunc("GET /api/v1/schedules/stats", s.handleScheduleStats)
	mux.HandleFunc("PUT /api/v1/schedules/{id}", s.handleUpdateSchedule)
	mux.HandleFunc("DELETE /api/v1/schedules/{id}", s.handleDeleteSchedule)
	mux.HandleFunc("PATCH /api/v1/schedules/{id}/enabled", s.handleSetScheduleEnabled)
	mux.HandleFunc("POST /api/v1/schedules/{id}/trigger", s.handleTriggerSchedule)

	// 注册 bot 平台的 HTTP 回调路由
	for pattern, cb := range s.botCallbacks {
		mux.HandleFunc(pattern, cb)
	}

	var handler http.Handler = mux
	// authMiddleware 在 CORS 内层：OPTIONS 预检请求由 CORS 直接处理，不经过 auth。
	// 当 api_key 为空时 authMiddleware 直接放行，不改变现有行为。
	handler = s.authMiddleware(handler)
	// 关停闸门在认证外层，使所有新写请求在关停期间一致获得 503。
	handler = s.shutdownMutationMiddleware(handler)

	// 注意中间件的包裹顺序：最外层是 Logging，里面一层是 CORS，再往内是关停闸门 + Auth + Mux。
	// 这样 Logging 就能记录到所有请求，包括那些被 CORS 拦截的 OPTIONS 预检请求。
	handler = cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization"},
	}).Handler(handler)

	// API 版本头中间件：在所有响应中添加 API-Version 头，为未来版本迁移预留
	corsHandler := handler
	handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("API-Version", "v1")
		corsHandler.ServeHTTP(w, r)
	})

	handler = loggingMiddleware(handler)
	handler = securityHeadersMiddleware(handler)
	return handler
}

func (s *Server) shutdownMutationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			s.lifecycleMu.Lock()
			if s.shuttingDown {
				s.lifecycleMu.Unlock()
				s.writeError(w, http.StatusServiceUnavailable, "Server is shutting down")
				return
			}
			s.activeMutations.Add(1)
			s.lifecycleMu.Unlock()
			defer s.activeMutations.Done()
		}
		next.ServeHTTP(w, r)
	})
}

// getPrimaryIP 通过 UDP 连接获取主网卡 IP（不发送数据包、无网络开销）
// OS 路由表自动选择默认网关路由的网卡，过滤掉所有虚拟网卡
func getPrimaryIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.UDPAddr).IP.String()
}
func (s *Server) Start(port int) error {
	handler := s.buildHandler()

	addr := serverListenAddr(s.bindAddress, port)
	httpServer := &http.Server{
		Addr:        addr,
		Handler:     handler,
		ReadTimeout: 30 * time.Second,
		IdleTimeout: 60 * time.Second,
	}

	s.lifecycleMu.Lock()
	if s.shuttingDown {
		s.lifecycleMu.Unlock()
		return http.ErrServerClosed
	}
	if s.started {
		s.lifecycleMu.Unlock()
		return fmt.Errorf("server already started")
	}
	s.started = true
	s.httpServer = httpServer
	startupDone := make(chan struct{})
	s.startupDone = startupDone
	s.startedBots = nil
	s.lifecycleMu.Unlock()

	log.Infof("[server] API server starting addr=%s", addr)
	if shouldWarnUnsafeBind(s.bindAddress, s.currentAPIKey()) {
		log.Warnf("[server] Listening on a non-loopback address without an API key — any host on the local network can reach delete/shutdown endpoints. Set api_key or bind to 127.0.0.1.")
	}
	blue := color.FgLightBlue.Render
	log.Infof("[server] Visit url=%s", blue("http://localhost"+addr+"/"))
	if lanIP := getPrimaryIP(); lanIP != "" {
		log.Infof("[server] Visit url=%s", blue("http://"+lanIP+addr+"/"))
	}

	if sched := s.getScheduler(); sched != nil {
		if s.isShuttingDown() {
			// startBots 尚未启动，其 defer close(startupDone) 不会执行；
			// 关闭通道避免关停的 bot 阶段在 <-startupDone 上空等满截止时间。
			close(startupDone)
			return http.ErrServerClosed
		}
		sched.Start()
		if s.isShuttingDown() {
			close(startupDone)
			return http.ErrServerClosed
		}
	}

	// Bot providers are optional adapters. Start them concurrently in the
	// background so a slow external service cannot delay the core HTTP API.
	go s.startBots(startupDone)
	return httpServer.ListenAndServe()
}

func (s *Server) startBots(done chan<- struct{}) {
	defer close(done)

	var starts sync.WaitGroup
	for _, b := range s.bots {
		if !s.beginBotStart(b) {
			break
		}
		starts.Add(1)
		go func(b bot.Bot) {
			defer starts.Done()
			if err := b.Start(); err != nil {
				log.Errorf("[bot] Start failed provider=%s error=%q", b.Name(), err.Error())
				return
			}
			log.Infof("[bot] Started provider=%s", b.Name())
		}(b)
	}

	// 等待所有 bot 启动，但受关停截止约束：某 provider 的 Start 挂死时
	// （例如 discord 网关握手后黑洞，Hello/READY 无界读），startupDone
	// 必须在截止时间内关闭，否则关停的 bot 阶段空等满预算且已启动的
	// bot 收不到 Stop。挂死的 goroutine 由进程退出兜底。
	waitCh := make(chan struct{})
	go func() {
		starts.Wait()
		close(waitCh)
	}()
	timeout := s.shutdownTimeout
	if timeout <= 0 {
		timeout = defaultShutdownDrainTimeout
	}
	select {
	case <-waitCh:
	case <-time.After(timeout):
		log.Warnf("[server] Bot startup drain timed out timeout=%s", timeout)
	}
}

func (s *Server) isShuttingDown() bool {
	s.lifecycleMu.Lock()
	defer s.lifecycleMu.Unlock()
	return s.shuttingDown
}

func (s *Server) beginBotStart(b bot.Bot) bool {
	s.lifecycleMu.Lock()
	defer s.lifecycleMu.Unlock()
	if s.shuttingDown {
		return false
	}
	s.startedBots = append(s.startedBots, b)
	return true
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Ping(); err != nil {
		s.writeJSON(w, http.StatusServiceUnavailable, NewErrorResponse("Database unavailable"))
		return
	}

	resp := HealthResponse{
		Status:    "ok",
		Version:   buildVersion(),
		Timestamp: time.Now().UTC(),
	}
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(resp))
}

func (s *Server) handleFavicon(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" style="color:#2563eb"><path fill="currentColor" d="M582 88c16 0 28 12 28 28v178h192c23 0 34 28 17 45l-76 76c-5 5-12 8-20 8H610v248c0 80 43 129 130 145 25 5 35 35 19 54l-70 82c-8 9-20 14-32 11-122-27-205-122-205-267V423H274c-24 0-35-29-17-46l77-75c5-5 12-8 19-8h99V116c0-16 12-28 28-28h102Zm-74 335v290c0 102 59 177 153 209l42-49c-99-31-149-101-149-202V423h-46Z"/></svg>`))
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Warnf("[api] Response write failed error=%q", err.Error())
	}
}

func (s *Server) writeError(w http.ResponseWriter, status int, message string) {
	s.writeJSON(w, status, NewErrorResponse(message))
}

func (s *Server) writeErrorDetail(w http.ResponseWriter, status int, message string, detail string) {
	s.writeJSON(w, status, NewErrorResponseWithDetail(message, detail))
}
func (s *Server) handleServerShutdown(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, NewSuccessResponse(map[string]interface{}{
		"message": "Server shutting down...",
		"action":  "shutdown",
	}))

	log.Info("[server] Shutdown requested source=api")
	go s.GracefulShutdown("shutdown")
}

func (s *Server) WaitForShutdown() {
	<-s.shutdownDone
}

func (s *Server) GracefulShutdown(reason string) {
	s.shutdownOnce.Do(func() {
		shutdownTimeout := durationOrDefault(s.shutdownTimeout, defaultShutdownDrainTimeout)
		deadline := time.Now().Add(shutdownTimeout)

		s.lifecycleMu.Lock()
		s.shuttingDown = true
		httpServer := s.httpServer
		startupDone := s.startupDone
		s.lifecycleMu.Unlock()

		if s.eventBus != nil {
			s.eventBus.PublishServerShutdown("服务器正在关闭: " + reason)
		}

		log.Infof("[server] Graceful shutdown started reason=%q timeout=%s", reason, shutdownTimeout)

		if s.taskManager != nil {
			s.taskManager.CancelAllTasks()
			s.taskManager.Close()
			log.Info("[server] Running tasks cancelled")
		}

		mutationDone := waitGroupDone(&s.activeMutations)
		queueDone := completedSignal()
		if s.downloadQueue != nil {
			queueDone = runShutdownPhase(func() {
				s.downloadQueue.CloseAndWait(boundedRemaining(deadline))
			})
		}

		schedulerDone := completedSignal()
		if sched := s.getScheduler(); sched != nil {
			schedulerDone = runShutdownPhase(sched.Stop)
		}

		botDone := runShutdownPhase(func() {
			if startupDone != nil {
				<-startupDone
			}
			s.stopStartedBots()
		})

		httpDone := completedSignal()
		if httpServer != nil {
			httpDone = runShutdownPhase(func() {
				shutdownCtx, shutdownCancel := context.WithDeadline(context.Background(), deadline)
				defer shutdownCancel()

				if err := httpServer.Shutdown(shutdownCtx); err != nil {
					log.Warnf("[server] HTTP shutdown failed error=%q", err.Error())
					if closeErr := httpServer.Close(); closeErr != nil && closeErr != http.ErrServerClosed {
						log.Warnf("[server] HTTP force close failed error=%q", closeErr.Error())
					}
					return
				}
				log.Info("[server] HTTP server stopped")
			})
		}

		// Log streams have no shutdown event, so close them immediately. Task SSE
		// streams exit themselves after flushing the server_shutdown event.
		if s.logHub != nil {
			s.logHub.Close()
		}
		if s.authRateLimit != nil {
			s.authRateLimit.Stop()
		}

		phases := []struct {
			name string
			done <-chan struct{}
		}{
			{name: "active mutations", done: mutationDone},
			{name: "download queue", done: queueDone},
			{name: "scheduler", done: schedulerDone},
			{name: "bot startup and stop", done: botDone},
			{name: "HTTP server", done: httpDone},
		}
		for _, phase := range phases {
			if !waitChannelUntil(phase.done, deadline) {
				log.Warnf("[server] Shutdown phase timed out phase=%q timeout=%s", phase.name, shutdownTimeout)
			}
		}

		if s.eventBus != nil {
			s.eventBus.Close()
		}

		if s.db != nil {
			if err := s.db.Close(); err != nil {
				log.Warnf("[server] Database close failed error=%q", err.Error())
			} else {
				log.Info("[server] Database connection closed")
			}
		}

		log.Info("[server] Shutdown complete")
		close(s.shutdownDone)
	})
}

func (s *Server) stopStartedBots() {
	s.lifecycleMu.Lock()
	startedBots := append([]bot.Bot(nil), s.startedBots...)
	s.lifecycleMu.Unlock()

	var stops sync.WaitGroup
	for _, b := range startedBots {
		stops.Add(1)
		go func(b bot.Bot) {
			defer stops.Done()
			b.Stop()
			log.Infof("[bot] Stopped provider=%s", b.Name())
		}(b)
	}
	stops.Wait()
}

func durationOrDefault(value, fallback time.Duration) time.Duration {
	if value > 0 {
		return value
	}
	return fallback
}

func waitGroupDone(group *sync.WaitGroup) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		group.Wait()
		close(done)
	}()
	return done
}

func completedSignal() <-chan struct{} {
	done := make(chan struct{})
	close(done)
	return done
}

func runShutdownPhase(fn func()) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		fn()
	}()
	return done
}

func boundedRemaining(deadline time.Time) time.Duration {
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return time.Nanosecond
	}
	return remaining
}

func waitChannelUntil(done <-chan struct{}, deadline time.Time) bool {
	remaining := time.Until(deadline)
	if remaining <= 0 {
		select {
		case <-done:
			return true
		default:
			return false
		}
	}
	timer := time.NewTimer(remaining)
	defer timer.Stop()
	select {
	case <-done:
		return true
	case <-timer.C:
		return false
	}
}

func (s *Server) handleScheduleStatusChange(running bool, statuses []scheduler.ScheduleStatus) {
	if s.eventBus == nil {
		return
	}
	s.eventBus.Publish("schedules", map[string]interface{}{
		"scheduler_running": running,
		"entries":           statuses,
	})

	for _, st := range statuses {
		if st.ConsecutiveFailures == 1 || (st.ConsecutiveFailures >= 3 && st.ConsecutiveFailures%3 == 0) {
			s.eventBus.PublishNotification(
				"schedule_warning",
				fmt.Sprintf("调度 %q 连续失败 %d 次", st.Entry.Name, st.ConsecutiveFailures),
				map[string]interface{}{
					"schedule_id":          st.Entry.ID,
					"consecutive_failures": st.ConsecutiveFailures,
				},
			)
		}
	}
}
