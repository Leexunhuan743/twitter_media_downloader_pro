# TMD 项目调用链分析报告

## 1. HTTP API 端点列表

### 1.1 核心下载端点 (download_handlers.go)

路由注册见 `internal/api/server.go#Server.buildHandler`。「处理器」列为 `buildHandler` 实际注册的函数；带路径参数的三组端点先由 `*Route` 包装器校验 `screen_name`/`list_id`，再转交内部函数（如 `handleUserDownloadRoute` → `handleUserDownload`）。

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/users/{screen_name}/download` | POST | `handleUserDownloadRoute` | 下载用户推文 |
| `/api/v1/users/{screen_name}/profile` | POST | `handleUserProfileRoute` | 下载用户资料 |
| `/api/v1/users/{screen_name}/mark` | POST | `handleUserMarkRoute` | 标记用户已下载 |
| `/api/v1/users/{screen_name}/following/download` | POST | `handleFollowingDownloadRoute` | 下载关注列表 |
| `/api/v1/users/{screen_name}/following/mark` | POST | `handleFollowingMarkRoute` | 标记关注已下载 |
| `/api/v1/lists/{list_id}/download` | POST | `handleListDownloadRoute` | 下载列表推文 |
| `/api/v1/lists/{list_id}/profile` | POST | `handleListProfileRoute` | 下载列表资料 |
| `/api/v1/lists/{list_id}/mark` | POST | `handleListMarkRoute` | 标记列表已下载 |
| `/api/v1/json/file/download` | POST | `handleJsonFileDownload` | JSON文件下载（`multipart/form-data` 时转入 `handleJsonFileUpload`） |
| `/api/v1/json/folder/download` | POST | `handleJsonFolderDownload` | 文件夹下载（`multipart/form-data` 时转入 `handleJsonFolderUpload`） |
| `/api/v1/batch/download` | POST | `handleBatchDownload` | 批量下载 |
| `/api/v1/batch/mark` | POST | `handleBatchMark` | 批量标记下载 |

### 1.2 任务管理端点 (download_handlers.go + task_manager.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/tasks` | GET | `handleTasks` | 获取所有任务 |
| `/api/v1/tasks/stats` | GET | `handleTaskStats` | 任务统计（按状态计数） |
| `/api/v1/tasks/{task_id}` | GET | `handleGetTask` | 获取单个任务 |
| `/api/v1/tasks/{task_id}/cancel` | POST | `handleCancelTask` | 取消任务 |
| `/api/v1/tasks/cancel-queued` | POST | `handleCancelQueuedTasks` | 取消所有排队中的任务 |
| `/api/v1/tasks/{task_id}/retry` | POST | `handleRetryTask` | 重试失败/取消的任务 |
| `/api/v1/tasks/{task_id}` | DELETE | `handleDeleteTask` | 删除终端状态任务 |

### 1.3 数据库管理端点 (db_handlers.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/db/users` | GET | `handleDBUsers` | 查询用户列表 |
| `/api/v1/db/users/{id}` | GET | `handleDBUserDetail` | 获取用户详情 |
| `/api/v1/db/users/{id}` | PATCH | `handleDBUserUpdate` | 更新用户 |
| `/api/v1/db/users/{id}` | DELETE | `handleDBUserDelete` | 删除用户 |
| `/api/v1/db/users/{id}/previous-names` | GET | `handleDBUserPreviousNames` | 获取用户历史名称 |
| `/api/v1/db/users/{id}/entities` | GET | `handleDBUserEntitiesByUserID` | 获取用户实体（按用户） |
| `/api/v1/db/users/{id}/links` | GET | `handleDBUserLinksByUserID` | 获取用户链接（按用户） |
| `/api/v1/db/user-previous-names` | GET | `handleDBPreviousNames` | 全局历史名称查询（含当前名称） |
| `/api/v1/db/lists` | GET | `handleDBLists` | 查询列表 |
| `/api/v1/db/lists/{id}` | GET | `handleDBListDetail` | 获取列表详情 |
| `/api/v1/db/lists/{id}` | PATCH | `handleDBListUpdate` | 更新列表 |
| `/api/v1/db/lists/{id}` | DELETE | `handleDBListDelete` | 删除列表 |
| `/api/v1/db/lists/{id}/entities` | GET | `handleDBLstEntitiesByListID` | 获取列表实体（按列表） |
| `/api/v1/db/user-entities` | GET | `handleDBUserEntities` | 查询用户实体 |
| `/api/v1/db/user-entities/{id}` | GET | `handleDBUserEntityDetail` | 获取用户实体详情 |
| `/api/v1/db/user-entities/{id}` | PATCH | `handleDBUserEntityUpdate` | 更新用户实体 |
| `/api/v1/db/user-entities/{id}` | DELETE | `handleDBUserEntityDelete` | 删除用户实体 |
| `/api/v1/db/list-entities` | GET | `handleDBListEntities` | 查询列表实体 |
| `/api/v1/db/list-entities/{id}` | GET | `handleDBListEntityDetail` | 获取列表实体详情 |
| `/api/v1/db/list-entities/{id}` | PATCH | `handleDBListEntityUpdate` | 更新列表实体 |
| `/api/v1/db/list-entities/{id}` | DELETE | `handleDBListEntityDelete` | 删除列表实体 |
| `/api/v1/db/user-links` | GET | `handleDBUserLinks` | 查询用户链接 |
| `/api/v1/db/user-links/{id}` | GET | `handleDBUserLinkDetail` | 获取用户链接详情 |
| `/api/v1/db/user-links/{id}` | PATCH | `handleDBUserLinkUpdate` | 更新用户链接 |
| `/api/v1/db/user-links/{id}` | DELETE | `handleDBUserLinkDelete` | 删除用户链接 |
| `/api/v1/db/stats` | GET | `handleDBStats` | 数据库统计 |

### 1.4 配置管理端点 (config_handlers.go + handlers.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/config` | GET | `handleConfig` (config_handlers.go) | 获取配置（脱敏：仅 RootPath/MaxDownloadRoutine/MaxUserFetchConcurrent/MaxFileNameLen 等安全字段） |
| `/api/v1/config/theme` | GET | `handleGetTheme` (handlers.go) | 获取当前主题（两种方法均免认证） |
| `/api/v1/config/theme` | POST | `handleSetTheme` (handlers.go) | 切换主题（`internal/api/handlers.go#setFrontendTheme`，仅改运行时内存变量，不写 conf.yaml；默认 web1，可选 web1/web2/web3，重启回落默认值） |
| `/api/v1/config/themes` | GET | `handleGetThemes` (handlers.go) | 获取可用主题列表（`internal/api/handlers.go#listThemes`） |
| `/api/v1/config/raw` | GET/PUT | `handleGetConfigRaw`/`handleUpdateConfigRaw` | 原始配置操作 |
| `/api/v1/config/fields` | GET/PUT | `handleGetConfigFields`/`handleSaveConfigFields` | 结构化配置 |

### 1.5 Cookie管理端点 (cookie_handlers.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/cookies` | GET/PUT | `handleGetCookies`/`handleSaveCookies` | Cookie管理 |
| `/api/v1/cookies/raw` | GET/PUT | `handleGetCookiesRaw`/`handleUpdateCookiesRaw` | 原始Cookie操作 |

### 1.6 日志端点 (log_handlers.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/logs` | GET | `handleGetLogs` | 获取日志 |
| `/api/v1/logs/stats` | GET | `handleLogStats` | 日志级别统计 |
| `/api/v1/logs/export` | GET | `handleLogExport` | 导出日志文件 |
| `/api/v1/logs/stream` | GET | `handleLogStream` | 日志流(SSE，实现在 sse_logs.go) |

### 1.7 系统端点 (server.go + auth_jwt.go + download_handlers.go + sse_tasks.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/health` | GET | `handleHealth` (server.go) | 健康检查（DB `Ping` 失败返回 503） |
| `/api/v1/auth/login` | POST | `handleAuthLogin` (auth_jwt.go) | 登录（API Key 换取 JWT） |
| `/api/v1/auth/refresh` | POST | `handleAuthRefresh` (auth_jwt.go) | 刷新 JWT |
| `/api/v1/auth/check` | GET | `handleAuthCheck` (auth_jwt.go) | 校验当前 JWT 状态 |
| `/api/v1/server/shutdown` | POST | `handleServerShutdown` (server.go) | 关闭服务器 |
| `/api/v1/sse/tasks` | GET | `handleSSETasks` (sse_tasks.go) | 任务实时推送(SSE) |
| `/api/v1/errors` | GET | `handleErrors` (download_handlers.go) | 失败推文摘要 |
| `/api/v1/errors/retry` | POST | `handleRetryAllFailed` (download_handlers.go) | 重试所有失败推文（创建 `TaskTypeRetryAllFailed` 任务） |
| `/api/v1/errors` | DELETE | `handleClearErrors` (download_handlers.go) | 清除失败推文记录 |
| `/api/v1/queue/status` | GET | `handleQueueStatus` (download_handlers.go) | 队列状态（待处理/活动/分离任务数） |

### 1.8 静态资源端点 (handlers.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/` | GET | `handleWeb` | 主页（路由模式 `GET /{$}`，仅匹配根路径） |
| `/tasks`, `/data`, `/schedules`, `/system`, `/logs` | GET | `handleWeb` | SPA 页面路由 |
| `/favicon.ico` | GET | `handleFavicon` | 站点图标 |
| `/static/{$}`, `/static/{path...}` | GET | `handleStatic` | 静态文件服务 |

### 1.9 计划任务端点 (scheduler_handlers.go)

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/schedules` | GET | `handleGetSchedules` | 获取所有计划任务 |
| `/api/v1/schedules` | PUT | `handleReplaceSchedules` | 替换所有计划任务 |
| `/api/v1/schedules` | POST | `handleCreateSchedule` | 创建计划任务 |
| `/api/v1/schedules/raw` | GET | `handleGetSchedulesRaw` | 获取原始 YAML 配置 |
| `/api/v1/schedules/raw` | PUT | `handleUpdateSchedulesRaw` | 更新原始 YAML 配置 |
| `/api/v1/schedules/reload` | POST | `handleReloadSchedules` | 重新加载配置文件 |
| `/api/v1/schedules/validate` | POST | `handleValidateSchedule` | 校验计划任务配置 |
| `/api/v1/schedules/trigger-all` | POST | `handleTriggerAllSchedules` | 触发所有计划任务 |
| `/api/v1/schedules/stats` | GET | `handleScheduleStats` | 计划任务统计 |
| `/api/v1/schedules/{id}` | PUT | `handleUpdateSchedule` | 更新指定计划任务 |
| `/api/v1/schedules/{id}` | DELETE | `handleDeleteSchedule` | 删除指定计划任务 |
| `/api/v1/schedules/{id}/enabled` | PATCH | `handleSetScheduleEnabled` | 启用/禁用指定计划任务 |
| `/api/v1/schedules/{id}/trigger` | POST | `handleTriggerSchedule` | 手动触发指定计划任务 |

### 1.10 Bot 回调端点（运行时动态注册）

由 `internal/api/server.go#Server.RegisterBotCallback` 在 `Start()` 之前登记到 `s.botCallbacks` 映射，`buildHandler` 遍历该映射注册路由（装配点见 `main.go#initBot`）。当前只有飞书回调：

| 端点 | 方法 | 处理器 | 功能 |
|------|------|--------|------|
| `/api/v1/bot/feishu/callback`（可由配置覆盖） | 由 `CallbackHandler` 决定 | `internal/bot/feishu/bot.go#Bot.CallbackHandler` | 飞书事件回调 |

说明：注册的精确路径会同时加入 `s.botCallbackPaths` 并在 `authMiddleware` 中免认证（第三方平台不带 TMD Bearer，回调由 `verify_token`/`encrypt_key` 自行校验）；只放行实际注册的路径，不放行宽泛的 `/api/v1/bot/` 前缀。

---

## 2. 调用链详细分析

### 2.1 用户下载调用链

```
HTTP Request
    ↓
[Middleware] securityHeadersMiddleware (安全响应头)
    ↓
[Middleware] loggingMiddleware (记录请求日志, 内部构造 responseRecorder)
    ↓
[Middleware] API-Version 头 (所有响应添加 `API-Version: v1`)
    ↓
[Middleware] CORS (跨域处理)
    ↓
[Middleware] shutdownMutationMiddleware (关停写闸门: POST/PUT/PATCH/DELETE 在关停期直接 503)
    ↓
[Middleware] authMiddleware (api_key 空放行; 非空校验 Bearer JWT / 原始 Key)
    ↓
Go `http.ServeMux` 路由匹配 (`POST /api/v1/users/{screen_name}/download`)
    ↓
handleUserDownloadRoute
    ↓
handleUserDownload
    ├── 请求解析: json.NewDecoder(r.Body).Decode(&req)
    ├── 参数校验: utils.IsValidScreenName（经 `internal/api/download_handlers.go#Server.screenNameFromPath` 归一化校验）
    ├── 创建任务: taskManager.CreateTask(TaskTypeUserDownload, &req)
    │   └── 生成UUID, 初始化context, 设置状态为queued
    ├── 入队任务: enqueueTask → DownloadQueue.Enqueue
    │   └── workerLoop 消费队列 → executeJob（`internal/api/download_queue.go#DownloadQueue.workerLoop` / `#DownloadQueue.executeJob`）
    │       ├── UpdateTaskStatus → running
    │       └── 调用: downloadService.UserDownload
    │           ├── path.NewStorePath (获取存储路径)
    │           ├── downloading.NewDumper + Load (加载错误记录)
    │           ├── twitter.GetUserByScreenName (获取用户信息)
    │           ├── initDownloader (初始化下载器)
    │           ├── downloading.BatchDownloadAny (批量下载)
    │           ├── collectFailedTweets (收集失败推文)
    │           ├── downloading.RetryFailedTweets (重试)
    │           ├── downloadProfile (可选: 下载头像/横幅)
    │           └── completeTask (完成任务)
    └── 返回响应: task_id, status等
```

### 2.2 批量下载调用链

```
handleBatchDownload
    ├── 请求解析: BatchDownloadTaskData（`limitJSONBody` 上限 rawContentBodyLimit=16MiB）
    ├── 参数校验:
    │   ├── users/lists/following_names 至少一项非空
    │   ├── normalizeBatchScreenNames (校验 users 与 following_names)
    │   └── validateBatchListIDs (校验 lists 中 listID > 0)
    ├── 创建任务: CreateTask(TaskTypeBatchDownload, &req)
    ├── 入队任务: buildAndEnqueueTask → DownloadQueue（队列关闭时 503）
    └── worker 执行: downloadService.BatchDownload
        ├── resolveUsers (解析用户)
        ├── resolveLists (解析列表)
        ├── resolveFollowings (解析关注列表)
        ├── path.NewStorePath
        ├── downloading.NewDumper + Load
        ├── downloading.BatchDownloadAny (`internal/downloading/batch_any.go#BatchDownloadAny`)
        │   ├── syncListAndGetMembers (同步列表成员, `internal/downloading/list_download.go#syncListAndGetMembers`)
        │   ├── BatchUserDownload (批量下载用户推文, `internal/downloading/batch_download.go#BatchUserDownload`)
        │   └── 返回: failedTweets, listMembers
        ├── collectFailedTweets
        ├── downloading.RetryFailedTweets (如果NoRetry=false)
        └── downloadProfile (如果SkipProfile=false)
```

### 2.3 数据库查询调用链 (以用户查询为例)

```
handleDBUsers
    ├── NewPagination (解析分页参数)
    ├── 构建查询条件:
    │   ├── database.BuildSearchCondition (搜索关键词)
    │   ├── accessible筛选
    │   └── protected筛选
    ├── database.Count (获取总数)
    ├── pagination.BuildOrderBy (构建排序)
    ├── database.QueryUsers (执行查询)
    └── 转换为DBUserItem响应
```

### 2.4 数据库删除调用链 (以用户删除为例)

```
handleDBUserDelete
    ├── 解析ID: resolvePathID (内部 strconv.ParseUint)
    ├── database.GetUserById (验证存在性)
    ├── countUserCascade (级联计数, 失败 fail-closed 拒绝删除)
    ├── 实体生命周期清理: QueryUserEntities → entitypkg.UserEntity.Remove (staged removal + journal)
    └── database.DelUser (事务删除, `internal/database/helpers.go#withTx`)
        ├── BEGIN TRANSACTION
        ├── DELETE FROM user_links WHERE user_id = ?
        ├── DELETE FROM user_entities WHERE user_id = ?
        ├── DELETE FROM user_previous_names WHERE user_id = ?
        ├── DELETE FROM users WHERE id = ?
        └── COMMIT / ROLLBACK
```

---

## 3. 完整性检查报告

### 3.1 请求处理完整性

| 端点类型 | 请求解析 | 参数验证 | 错误处理 | 响应格式 | 状态 |
|----------|----------|----------|----------|----------|------|
| 下载端点 | ✅ JSON Decode | ✅ ScreenName格式<br>✅ ListID>0 | ✅ 返回400/500 | ✅ 统一APIResponse | 完整 |
| 数据库端点 | ✅ Query参数 | ✅ ID解析 | ✅ 404/500 | ✅ 分页响应 | 完整 |
| 配置端点 | ✅ JSON/YAML | ✅ 必填字段 | ✅ 400/500 | ✅ 结构化响应 | 完整 |
| 任务端点 | ✅ PathValue | ✅ TaskID存在性 | ✅ 404/400 | ✅ 任务对象 | 完整 |

### 3.2 数据库操作完整性

| 操作类型 | 事务管理 | 错误回滚 | 连接池 | 边界检查 |
|----------|----------|----------|--------|----------|
| 用户删除 (DelUser) | ✅ `withTx` (Beginx+Commit) | ✅ defer Rollback | ✅ sqlx.DB | ✅ RowsAffected检查 |
| 列表删除 (DelLst) | ✅ `withTx` (Beginx+Commit) | ✅ defer Rollback | ✅ sqlx.DB | ✅ 级联删除user_links |
| 用户更新 (UpdateUser) | ❌ 无事务 | ❌ 无回滚 | ✅ sqlx.DB | ✅ RowsAffected检查 |
| 列表更新 (UpdateLst) | ❌ 无事务 | ❌ 无回滚 | ✅ sqlx.DB | ✅ RowsAffected检查 |
| 实体更新 | ❌ 无事务 | ❌ 无回滚 | ✅ sqlx.DB | ✅ 存在性检查 |
| 查询操作 | N/A | N/A | ✅ sqlx.DB | ✅ 空结果处理 |

事务助手为 `internal/database/helpers.go#withTx`（无 ctx 的包内快速助手，供现有无 ctx 签名的数据库函数使用）；携带 context 的调用方走 `internal/database/tx/manager.go#Manager.RunInTransaction`。代码注释明确要求不要新增第三套事务助手。

**问题发现**: 
- `UpdateUser`, `UpdateLst` 等更新操作未使用事务，存在数据不一致风险
- 建议统一使用 `withTx`（无 ctx 的数据库函数）或 `tx.Manager.RunInTransaction`（ctx 感知的调用方）包装写操作

### 3.3 中间件应用检查

```
请求处理流程 (从外到内):
Client Request
    ↓
[securityHeadersMiddleware] - 设置 X-Content-Type-Options/X-Frame-Options/Referrer-Policy 安全响应头
    ↓
[loggingMiddleware] - 记录请求方法、路径、IP、状态码、耗时
    ↓
[API-Version 头] - 所有响应添加 `API-Version: v1` 头
    ↓
[CORS Middleware] - 处理跨域，允许所有来源与 `GET/POST/PUT/PATCH/DELETE/OPTIONS`
    ↓
[shutdownMutationMiddleware] - 关停写闸门：POST/PUT/PATCH/DELETE 在关停期直接 503，并计入 activeMutations
    ↓
[authMiddleware] - api_key 为空放行；非空校验 Bearer JWT / 原始 Key（SSE 回退 ?token=）
    ↓
[Handler] - 业务处理
```

| 中间件 | 应用范围 | 功能 | 状态 |
|--------|----------|------|------|
| securityHeadersMiddleware | 所有路由 | 安全响应头 | ✅ 完整 |
| loggingMiddleware | 所有路由 | 请求日志（内部构造 responseRecorder 记录状态码，`internal/api/middleware.go#responseRecorder`） | ✅ 完整 |
| API-Version 头 | 所有路由 | 响应头 `API-Version: v1` | ✅ 完整 |
| CORS | 所有路由 | 跨域处理 | ✅ 完整 |
| shutdownMutationMiddleware | 所有路由 | 关停期对写方法返回 503，并跟踪进行中的写请求（`internal/api/server.go#Server.shutdownMutationMiddleware`） | ✅ 完整 |
| authMiddleware | 除公开路径与已注册 bot 回调外的所有路由 | 认证（JWT/API Key） | ✅ 完整 |

中间件包裹顺序来自 `internal/api/server.go#Server.buildHandler`：从外到内为 securityHeadersMiddleware → loggingMiddleware → API-Version 头 → CORS → **shutdownMutationMiddleware** → authMiddleware → mux。`responseRecorder` 不是独立中间件，而是 `loggingMiddleware` 内部构造的 ResponseWriter 包装（`internal/api/middleware.go#responseRecorder`）。关停闸门刻意放在认证外层，使关停期间所有写请求一致返回 503，而不依赖配置了哪些 API Key。

**注意**: 
- 认证由 `internal/api/middleware.go#Server.authMiddleware` 提供：`api_key` 为空时放行所有请求（向后兼容）；非空时优先校验 `Authorization: Bearer <JWT>`，回退原始 API Key 字符串比较，SSE 端点无法设置自定义头时回退 `?token=` 查询参数；`/api/v1/auth/refresh`、`/api/v1/auth/check` 允许“签名有效但已过期”的 JWT 通过（`internal/api/middleware.go#isAuthManagementPath`）
- 公开路径由 `internal/api/middleware.go#isPublicPath` 判定：`/`、`/favicon.ico`、SPA 页面（`/tasks`、`/data`、`/schedules`、`/system`、`/logs`）以及前缀白名单 `/api/v1/health`、`/api/v1/auth/login`、`/api/v1/config/theme`、`/static/`；此外 `internal/api/server.go#Server.RegisterBotCallback` 登记的精确回调路径也免认证
- 认证失败返回 401，并通过 `X-Token-Type: expired|invalid` 与 `WWW-Authenticate` 头区分处理策略（`internal/api/middleware.go#writeAuth401`）
- 全局请求限流仍缺失：只有 auth 登录/refresh/check 三个端点在处理入口调用 `authRateLimiter.Allow/Fail`（`internal/api/auth_jwt.go#Server.handleAuthLogin` / `#Server.handleAuthRefresh` / `#Server.handleAuthCheck`，限流器实现在 `internal/api/auth_jwt.go#authRateLimiter`），其余端点没有请求频率保护
- 请求大小限制已按用途分级（见 3.5），但尚未覆盖全部 JSON 端点

### 3.4 边界情况检查

| 场景 | 处理情况 | 状态 |
|------|----------|------|
| 无效ScreenName | ✅ 返回400 Bad Request | 已处理 |
| ListID=0 | ✅ 返回400 Bad Request | 已处理 |
| 不存在的TaskID | ✅ 返回404 Not Found | 已处理 |
| 已完成的任务取消 | ✅ 返回400 Bad Request | 已处理 |
| 数据库连接失败 | ✅ health检查返回503 | 已处理 |
| 空请求体 | ✅ 使用默认值或返回400 | 已处理 |
| 文件不存在 | ✅ 返回404或空结果 | 已处理 |
| 路径遍历攻击 | ✅ `filepath.Clean` + 允许根目录前缀包含检查（`internal/service/download_service.go#downloadServiceImpl.validateJsonPaths`，前缀含 RootPath 与 AppRootPath，二者均同时加入带/不带分隔符的两种形式） | 已处理 |
| 超大分页参数 | ✅ 限制pageSize<=200 | 已处理 |
| 并发任务创建 | ✅ TaskManager加锁保护 | 已处理 |
| 关停期间发起写请求 | ✅ `shutdownMutationMiddleware` 直接返回503 | 已处理 |
| 请求体超限 | ✅ 已加限制的端点返回413 | 部分覆盖（见 3.5） |

### 3.5 请求体大小限制现状

常量定义在 `internal/api/resource_handler.go`（JSON/raw）与 `internal/api/download_handlers.go`（上传），统一通过 `http.MaxBytesReader` 施加：

| 用途 | 上限 | 常量 / 施加点 |
|------|------|----------------|
| 普通 JSON（配置字段、Cookie、调度条目、批量标记、JSON 下载参数、主题切换） | 1 MiB | `internal/api/resource_handler.go#defaultJSONBodyLimit`，经同文件 `Server.decodeBody` 或 `Server.limitJSONBody` 施加 |
| 携带 raw YAML / 批量内容字段（conf.yaml、schedules.yaml、cookies YAML、批量任务列表） | 16 MiB | `internal/api/resource_handler.go#rawContentBodyLimit` |
| multipart 上传请求体总量（`/api/v1/json/file/download`、`/api/v1/json/folder/download` 的 multipart 分支） | 1 GiB | `internal/api/download_handlers.go#maxUploadRequestSize`（`Server.handleJsonFileUpload` / `Server.handleJsonFolderUpload`） |
| 单个上传文件 | 400 MiB | `internal/api/download_handlers.go#maxUploadFileSize` |
| multipart 内存缓冲（超出部分落盘） | 32 MiB | `internal/api/download_handlers.go#maxUploadMemory`（`ParseMultipartForm`） |

超限时 `internal/api/resource_handler.go#Server.writeBodyTooLarge` 返回 413，与上传接口语义一致。

**仍存在的缺口**: 用户与列表的 download/mark 及关注 download/mark 共 6 条路由（`/api/v1/users/{screen_name}/download`、`/mark`、`/following/download`、`/following/mark`、`/api/v1/lists/{list_id}/download`、`/mark`）走 `internal/api/download_handlers.go#decodeOptionalJSON`，该函数只解码 JSON 且**未**套 `MaxBytesReader`，因此这些端点没有请求体上限（`profile` 两类端点不读请求体，无此问题）。

---

## 4. 调用关系图

### 4.1 模块依赖图

```
┌─────────────────────────────────────────────────────────────────┐
│                           API Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   server.go  │  │ download_    │  │   db_handlers.go     │  │
│  │   (路由注册)  │  │ handlers.go  │  │   (数据库CRUD)        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────────▼───────────┐  │
│  │   config_    │  │   cookie_    │  │   log_handlers.go    │  │
│  │  handlers.go │  │  handlers.go │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Service Layer                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              download_service.go                         │  │
│  │  - UserDownload      - ProfileDownload                   │  │
│  │  - ListDownload      - MarkDownloaded                    │  │
│  │  - FollowingDownload - BatchDownload                     │  │
│  │  - JsonFileDownload  - JsonFolderDownload                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Business Logic                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  downloading │  │  twitter/    │  │   downloader/        │  │
│  │  (下载逻辑)   │  │  (API客户端)  │  │   (文件写入)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  database/   │  │   tx/        │  │    path/             │  │
│  │  (CRUD操作)   │  │ (事务管理器)  │  │   (路径管理)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

上图仅示意主要文件，`internal/api/` 实际还包含：`task_manager.go`/`task_types.go`（任务状态机与类型）、`download_queue.go`（队列与 workerLoop）、`download_targets.go`（目标去重键）、`scheduler_handlers.go`/`scheduler_download.go`、`auth_jwt.go`（JWT 签发/校验）、`middleware.go`、`sse_tasks.go`/`sse_logs.go`、`resource_handler.go`（共享解析/响应助手）、`event_bus.go`、`bot_notify.go`、`pagination.go`、`progress.go`、`task_log.go`、`log_handlers.go`、`version.go`。

### 4.2 任务状态转换图

```
                    CreateTask
                         │
                         ▼
                  ┌─────────────┐
                  │   queued    │
                  └──────┬──────┘
                         │ UpdateTaskStatus
                         ▼
                  ┌─────────────┐
      ┌──────────│   running   │──────────┐
      │          └──────┬──────┘          │
      │                 │                 │
      ▼                 ▼                 ▼
┌─────────┐      ┌──────────┐      ┌───────────┐
│completed│      │  failed  │      │ cancelled │
└─────────┘      └──────────┘      └───────────┘

Terminal Status: completed, failed, cancelled

New in v3.4.19:
- DeleteTask: 删除 completed/failed/cancelled 状态的任务
- RetryTask: 基于 failed/cancelled 任务的 taskData 创建新任务
```

补充：`internal/api/task_manager.go#canTransitionStatus` 允许 `queued` 直接进入三个终态（例如入队失败时 `SetTaskError` 会把仍处于 queued 的任务置为 failed；`CancelTask` 对 queued 任务同样直接落 cancelled），上图只画了最常见的 queued → running 路径。状态机由 `internal/api/task_manager.go#isTerminalStatus` / `#canTransitionStatus` 定义，终态为 completed、failed、cancelled。

### 4.3 下载服务调用图

```
DownloadService Interface
    │
    ├── UserDownload(screenName)
    │       ├── GetUserByScreenName
    │       ├── BatchDownloadAny
    │       ├── RetryFailedTweets
    │       └── downloadProfile
    │
    ├── ListDownload(listID)
    │       ├── GetLst
    │       ├── BatchDownloadAny
    │       ├── RetryFailedTweets
    │       └── downloadProfile
    │
    ├── FollowingDownload(screenName)
    │       ├── GetUserByScreenName
    │       ├── BatchDownloadAny
    │       └── downloadProfile
    │
    ├── BatchDownload(users, lists, followings)
    │       ├── resolveUsers
    │       ├── resolveLists
    │       ├── resolveFollowings
    │       ├── BatchDownloadAny
    │       └── downloadProfile
    │
    ├── ProfileDownload(screenNames)
    │       ├── resolveUsers
    │       └── downloadProfile
    │
    ├── ListProfileDownload(listID)
    │       ├── GetLst
    │       ├── GetMembers
    │       └── downloadProfile
    │
    ├── MarkDownloaded(...)
    │       ├── resolveUsers
    │       ├── resolveLists
    │       ├── resolveFollowings
    │       └── MarkUsersAsDownloaded (`internal/downloading/mark_downloaded.go#MarkUsersAsDownloaded`)
    │
    ├── JsonFileDownload(paths)
    │       ├── validateJsonPaths
    │       ├── downloading.NewJsonDumper + Load
    │       ├── DownloadThirdPartyTweets
    │       └── RetryFailedJsonTweets (如果NoRetry=false)
    │
    ├── JsonFolderDownload(paths)
    │       ├── validateJsonPaths
    │       ├── downloading.NewJsonDumper + Load
    │       ├── DownloadFromLoongTweetFolder
    │       └── RetryFailedJsonTweets (如果NoRetry=false)
    │
    ├── RetryAllFailed()
    │       ├── downloading.NewDumper
    │       ├── downloading.RetryFailedTweets
    │       ├── downloading.NewJsonDumper
    │       └── downloading.RetryFailedJsonTweets
    │
    └── ClearErrors()
            └── os.Remove(errors.json + json_errors.json)
```

说明：`UserDownload`、`ListDownload`、`FollowingDownload`、`BatchDownload` 都只是构造 `downloadTemplateConfig` 并调用共享模板 `internal/service/download_service.go#downloadServiceImpl.executeDownloadTemplate`，图中列出的 BatchDownloadAny / RetryFailedTweets / downloadProfile / completeTask 由该模板统一驱动；`ProfileDownload`、`ListProfileDownload`、`MarkDownloaded`、`JsonFileDownload`、`JsonFolderDownload` 各自独立实现。

---

## 5. 潜在问题与建议

### 5.1 事务管理不一致

**问题**: 部分数据库操作使用显式事务，部分不使用

```go
// 使用事务的示例 (internal/database/user.go#DelUser)
func DelUser(db *sqlx.DB, uid uint64) error {
    return withTx(db, func(tx *sqlx.Tx) error {
        // ... 多个 DELETE
        return nil
    })
}

// 未使用事务的示例 (internal/database/user.go#UpdateUser)
func UpdateUser(db *sqlx.DB, usr *User) error {
    _, err := db.NamedExec(stmt, usr)  // 直接执行，无事务
    return err
}
```

**建议**: 无 ctx 的数据库函数统一用 `internal/database/helpers.go#withTx`；ctx 感知的调用方用 `internal/database/tx/manager.go#Manager.RunInTransaction`（不要新增第三套事务助手）

### 5.2 错误处理模式不一致

**问题**: 部分错误包装了上下文，部分没有

```go
// 有上下文的错误
return fmt.Errorf("failed to create user %d: %w", usr.Id, err)

// 无上下文的错误
return err
```

**建议**: 统一使用 `fmt.Errorf("context: %w", err)` 包装错误

### 5.3 请求大小限制覆盖不全（已分级，未全覆盖）

**问题**: 请求体限制已按用途分级（1 MiB JSON / 16 MiB raw / 1 GiB 上传总量），但**未覆盖全部 JSON 端点**：用户与列表的 download/mark、关注的 download/mark 共 6 条路由经 `internal/api/download_handlers.go#decodeOptionalJSON` 解码，没有 `MaxBytesReader` 包裹（详见 3.5）

**建议**: 
- 保持现有分级上限（`internal/api/resource_handler.go` 的 `defaultJSONBodyLimit`/`rawContentBodyLimit` 与 `internal/api/download_handlers.go` 的 `maxUploadRequestSize`/`maxUploadFileSize`/`maxUploadMemory`）
- 给 `decodeOptionalJSON` 的 6 个调用点补上 `defaultJSONBodyLimit`（这些请求体都很小，1 MiB 足够）

### 5.4 任务取消机制

**问题**: 任务取消依赖context，但部分底层调用可能不支持

**建议**: 确保所有长时间运行的操作都检查 `ctx.Done()`

### 5.5 数据库连接关闭依赖关停流程

**问题**: `internal/api/server.go#Server.GracefulShutdown` 会在最后阶段执行 `s.db.Close()`；但整个关停受单一总截止时间约束（`internal/api/server.go#defaultShutdownDrainTimeout` = 45s），任一阶段超时只记录警告并继续，因此极端情况下 DB 关闭可能发生在进程退出路径上

**建议**: 连接池边界已存在——`internal/database/sqlite.go#configureSQLiteConnection` 设置 `SetMaxOpenConns(1)`/`SetMaxIdleConns(1)`（SQLite 文件库，避免并发写），`/api/v1/health` 通过 `s.db.Ping()` 做健康检查。可选改进：把关停各阶段的超时情况纳入可观测指标，便于判断是否需要调整总截止时间

---

## 6. 总结

### 6.1 整体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | 9/10 | 所有端点都有完整的请求-响应处理 |
| 错误处理 | 8/10 | 大部分错误有处理，但部分缺少上下文 |
| 并发安全 | 9/10 | TaskManager使用RWMutex保护 |
| 事务管理 | 6/10 | 不一致，部分操作无事务保护 |
| 代码组织 | 8/10 | 分层清晰，但部分函数过长 |

### 6.2 关键文件清单

| 文件 | 职责 | 状态 |
|------|------|------|
| `internal/api/server.go` | 路由注册、服务器生命周期 | 良好 |
| `internal/api/download_handlers.go` | 下载相关HTTP处理器 | 良好 |
| `internal/api/db_handlers.go` | 数据库CRUD处理器 | 良好 |
| `internal/api/task_manager.go` | 任务管理、状态机 | 良好 |
| `internal/api/middleware.go` | 请求日志、安全响应头、认证中间件（`authMiddleware`/`isPublicPath`） | 良好 |
| `internal/api/auth_jwt.go` | JWT 签发/校验、refresh 年龄限制、auth 限流器 | 良好 |
| `internal/api/download_queue.go` | 下载队列、workerLoop、冲突/目标键与任务分离 | 良好 |
| `internal/cli/executor.go` | CLI命令执行 | 良好 |
| `internal/service/download_service.go` | 下载业务逻辑 | 良好 |
| `internal/database/tx/manager.go` | 事务管理器（ctx 感知） | 良好但未充分利用 |
| `internal/database/helpers.go` | `withTx` 包内事务助手 | 良好 |

### 6.3 推荐的改进优先级

1. **高优先级**: 统一数据库事务管理
2. **中优先级**: 为 6 个未经 `MaxBytesReader` 包裹的 download/mark 端点补上 `defaultJSONBodyLimit`（见 3.5/5.3）
3. **中优先级**: 统一错误处理模式
4. **低优先级**: 添加更多边界测试用例
