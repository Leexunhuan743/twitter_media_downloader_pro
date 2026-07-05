# TMD 日志系统实现文档

> 基于实际代码分析的全面日志系统文档。涵盖了从底层日志基础设施到上层业务日志使用的完整视图。
> 最后更新：2026-07-05

---

## 一、日志栈概览

```
┌────────────────────────────────────────────────────────────────┐
│                       业务层日志                                │
│  internal/cli, internal/api, internal/service,                  │
│  internal/downloading, internal/downloader, internal/twitter,   │
│  internal/scheduler, internal/config, internal/bot/*            │
├────────────────────────────────────────────────────────────────┤
│                      Logrus (v1.9.3)                            │
│  github.com/sirupsen/logrus — 结构化日志库                      │
│  全局 log.* 方法, TextFormatter, 日志级别                       │
├────────────────────────────────────────────────────────────────┤
│                    lfshook (v0.0.0-20180920)                    │
│  github.com/rifflock/lfshook — 文件 Hook                        │
│  将 logrus 日志输出到 lumberjack Logger                         │
├────────────────────────────────────────────────────────────────┤
│                   lumberjack (v2.0.0)                           │
│  github.com/natefinch/lumberjack — 日志轮转                     │
│  按大小/备份数/天数轮转, 压缩控制                               │
├────────────────────────────────────────────────────────────────┤
│                  consolelog (internal)                          │
│  internal/consolelog/hub.go — 控制台日志捕获                    │
│  环形缓冲区, stdout/stderr 管道劫持, 发布/订阅                  │
├────────────────────────────────────────────────────────────────┤
│               Web UI (浏览器) REST + SSE                        │
│  GET /api/v1/logs, /api/v1/logs/stream,                        │
│  /api/v1/logs/stats, /api/v1/logs/export                       │
└────────────────────────────────────────────────────────────────┘
```

### 依赖版本（从 go.mod 提取）

| 依赖 | 版本 | 用途 |
|-------|-------|---------|
| `github.com/sirupsen/logrus` | v1.9.3 | 结构化日志核心库 |
| `github.com/natefinch/lumberjack` | v2.0.0+incompatible | 日志轮转（直接使用） |
| `gopkg.in/natefinch/lumberjack.v2` | v2.2.1 | 日志轮转（间接依赖，通过其他包） |
| `github.com/rifflock/lfshook` | v0.0.0-20180920164130-b9218ef580f5 | 日志文件 Hook |

> **注意**：go.mod 中存在两个 lumberjack 条目。`gopkg.in/natefinch/lumberjack.v2` 是间接依赖（未被实际使用），应清理。

---

## 二、初始化流程

### 2.1 启动时序

```
main()
 ├── 解析引导参数 (parseBootstrapArgs)
 ├── 确定应用根目录 (resolveAppRootPath) → ~/.tmd2 或 %APPDATA%\.tmd2
 ├── 创建 lumberjack.Logger{filename: "tmd2.log"}
 ├── 创建 consolelog.DefaultHub()  (5000 行环形缓冲区)
 ├── initLogger(dbg, logWriter, consoleLogHub)
 │   ├── log.SetFormatter(TextFormatter{ForceColors, FullTimestamp, DisableSorting})
 │   ├── log.SetLevel(DebugLevel 或 InfoLevel)
 │   ├── consolelog.StartCapture(hub) → 劫持 stdout/stderr → hub
 │   │   └── 成功时: log.SetOutput(os.Stderr)
 │   └── log.AddHook(lfshook.NewHook(logWriter, nil)) → 所有日志 -> lumberjack
 └── 继续: 加载配置, 初始化客户端, CLI/Server 分流
```

### 2.2 initLogger 详解

```go
func initLogger(dbg bool, logFile io.Writer, logHub *consolelog.Hub) {
    log.SetFormatter(&log.TextFormatter{
        ForceColors:    true,   // 强制彩色输出
        FullTimestamp:  true,   // 完整时间戳
        DisableSorting: true,   // 不排序字段（性能优化）
        PadLevelText:   false,  // 不填充级别文本
    })

    if dbg {
        log.SetLevel(log.DebugLevel)
    } else {
        log.SetLevel(log.InfoLevel)
    }

    // 尝试捕获控制台输出到 Hub
    if err := consolelog.StartCapture(logHub); err != nil {
        log.Warnf("[startup] Failed to start console log capture: %v", err)
    } else {
        // 成功捕获后将 logrus 输出重定向到 stderr（stdout 被管道捕获）
        log.SetOutput(os.Stderr)
    }

    // 所有日志级别写入轮转文件
    log.AddHook(lfshook.NewHook(logFile, nil))
    // nil = 所有级别都写入文件
}
```

**关键设计决策**：
- stdout 被管道捕获作为 consolelog Hub 的输入
- logrus 输出到 stderr 以避免重复（stderr 也同样被管道捕获）
- lfshook 将日志写入 lumberjack 进行轮转
- 最终日志流：logrus.Infof/Warnf/... → 文本格式化 → stderr（控制台） + lfshook → lumberjack → 文件

### 2.3 lumberjack 配置

```go
logWriter := &lumberjack.Logger{
    Filename:   filepath.Join(appRootPath, "tmd2.log"),  // 日志路径
    MaxSize:    2,     // 单个文件最大 2MB
    MaxBackups: 2,     // 最多保留 2 个备份
    MaxAge:     14,    // 最多保留 14 天
    Compress:   false, // 不压缩轮转的日志文件
}
```

---

## 三、日志输出示例

### 3.1 TextFormatter 格式

logrus TextFormatter 的默认输出格式：

```
time="2026-07-05T10:30:00+08:00" level=info msg="[server] API server starting on :25556"
time="2026-07-05T10:30:01+08:00" level=error msg="[db] QueryUsers failed: database is locked" 
time="2026-07-05T10:30:02+08:00" level=warning msg="[auth] Rate limit exceeded for 192.168.1.1"
time="2026-07-05T10:30:03+08:00" level=debug msg="[twitter] GetUserByScreenName(elonmusk) → client: master@twitter"
```

**时间戳格式**：`time="2006-01-02T15:04:05-07:00"`（RFC 3339 带时区偏移）

**级别文本映射**：
| logrus 级别 | TextFormatter 文本 |
|--------------|-------------------|
| `DebugLevel` | `level=debug` |
| `InfoLevel`  | `level=info` |
| `WarnLevel`  | `level=warning` |
| `ErrorLevel` | `level=error` |
| `FatalLevel` | `level=fatal` |

### 3.2 Web UI 上的时间戳高亮

前端 JS（`web1/app.js:2466-2470`）使用正则解析 logrus 时间戳格式：
```javascript
// logrus 格式: time="..." → escapeHtml 后 time=&quot;...&quot;
line.replace(
  /time=(&quot;)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2})(&quot;)/g,
  'time=<span class="log-timestamp">$2</span>'
)
```

---

## 四、控制台日志捕获 — `consolelog` 包

### 4.1 架构

```
                      控制台（终端设备）
                    ┌──────────────────┐
                    │  stdout / stderr  │
                    └────────┬─────────┘
                             │ os.Pipe() 劫持
                             ▼
┌────────────────────────────────────────────────────┐
│                 consolelog.Hub                      │
│  ┌─────────────────────────────────────────────┐   │
│  │  环形缓冲区 (ring buffer, 默认 5000 行)      │   │
│  │  lines []string, start int, count int       │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  订阅者 map[*logSubscriber]struct{}          │   │
│  │  每个订阅者 = chan string (缓冲 100)          │   │
│  └─────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
         │                            │
         ▼                            ▼
  Snapshot() []string          Subscribe() (<-chan string, func())
  返回历史日志                   返回实时日志流
         │                            │
         ▼                            ▼
  Web UI REST API              SSE / Bot 通知
  GET /api/v1/logs             GET /api/v1/logs/stream
  GET /api/v1/logs/stats       RunBotLogLoop()
```

### 4.2 Hub 数据结构

```go
type Hub struct {
    mu          sync.Mutex
    lines       []string               // 环形缓冲区
    start       int                    // 起始位置
    count       int                    // 当前有效行数
    limit       int                    // 最大行数（默认 5000）
    subscribers map[*logSubscriber]struct{}
}

type logSubscriber struct {
    mu      sync.Mutex
    closeMu sync.Once
    ch      chan string   // 缓冲 100 条
    closed  bool
}
```

### 4.3 环形缓冲区逻辑

```go
// 添加新行
func (h *Hub) Add(line string) {
    line = strings.TrimSpace(stripANSI(line))  // 去除 ANSI 转义和首尾空白
    if line == "" { return }

    h.mu.Lock()
    if h.count < h.limit {
        idx := (h.start + h.count) % h.limit
        h.lines[idx] = line
        h.count++
    } else {
        h.lines[h.start] = line
        h.start = (h.start + 1) % h.limit
    }
    // 复制订阅者列表以避免在锁外遍历
    subscribers := make([]*logSubscriber, 0, len(h.subscribers))
    for sub := range h.subscribers { subscribers = append(subscribers, sub) }
    h.mu.Unlock()

    // 非阻塞发送到每个订阅者
    for _, sub := range subscribers {
        switch sub.send(line) {
        case logSendOverflow:
            overflowed = append(overflowed, sub)
        }
    }
    // 移除过慢的订阅者
    if len(overflowed) > 0 {
        h.removeSubscribers(overflowed)
    }
}
```

**缓冲溢出保护**：订阅者的 channel 缓冲满时（100 条），该订阅者被立即关闭并移除，防止慢消费者阻塞整个日志系统。

### 4.4 stdout/stderr 管道捕获

```go
func startCaptureSession(h *Hub) (*captureSession, error) {
    // 创建 stdout/stderr 管道
    stdoutReader, stdoutWriter, _ := os.Pipe()
    stderrReader, stderrWriter, _ := os.Pipe()

    // 替换全局 stdout/stderr
    os.Stdout = stdoutWriter
    os.Stderr = stderrWriter

    // 后台 goroutine 读取管道并写入 Hub
    go capturePipe(stdoutReader, originalStdout, h)
    go capturePipe(stderrReader, originalStderr, h)
}
```

`capturePipe` 函数：
- 从管道读取数据
- 先写入原始的 `os.File`（保持控制台显示）
- 逐行分割后调用 `h.Add(line)` 写入 Hub
- 处理跨 chunk 的行拼接（通过 `io.Reader.Read` + `bytes.IndexByte` 手动按 `\n` 分割）

---

## 五、日志级别约定

### 5.1 阈值规则

| 日志级别 | 应用场景 | 示例 |
|-----------|----------|---------|
| `Debugf` | 用户输入验证失败、内部解析细节、JSON 解析错误、低层级 API 调试信息 | `Invalid screen_name`, `Failed to parse uint64` |
| `Infof` | 正常操作的状态变化、进度报告、成功消息 | `Batch download complete`, `Task created`, `Config saved` |
| `Warnf` | 非致命操作失败、预期内的异常（限流、文件错误、上游 API 错误）、不影响主体的失败 | `Rate limit exceeded`, `Failed to load additional cookies` |
| `Errorf` | 将返回给用户的内部错误、数据库查询失败、系统性故障 | `QueryUsers failed`, `Failed to create store dir` |
| `Fatalln` | 启动时不可恢复的错误、致命初始化失败 | `Failed to login`, `Failed to connect to database` |

### 5.2 级别与 API 响应的关联

| HTTP 状态码 | 日志级别 | 场景 |
|-------------|-----------|---------|
| 400 Bad Request | `Debugf` | 用户输入验证失败（JSON 解析、参数校验） |
| 401 Unauthorized | `Warnf` 或 `Debugf` | 认证失败（速率限制、Token 无效） |
| 500 Internal Server Error | `Errorf` | 数据库错误、服务内部故障 |
| 503 服务的错误 | 不适用 | 流式日志 |
| 4xx/5xx 中的其他错误 | `Errorf`（5xx）/ `Warnf`（4xx） | 按状态码分级 |

---

## 六、日志前缀约定

### 6.1 完整的前缀对照表

所有日志消息使用 `[domain]` 前缀标识来源域，每层有自己独立的前缀体系。

| 前缀 | 文件/包 | 使用位置 |
|----------|----------|-----------|
| `[api]` | `internal/api/server.go` | 通用 API 层 |
| `[auth]` | `internal/api/auth_jwt.go`, `middleware.go` | 认证中间件和 JWT 操作 |
| `[batch]` | `internal/downloading/batch_*.go` | 批量下载操作 |
| `[bot]` | `internal/api/server.go` | Bot 生命周期管理 |
| `[bot-discord]` | `internal/bot/discord/*.go` | Discord bot |
| `[bot-feishu]` | `internal/bot/feishu/*.go` | Feishu/Lark bot |
| `[bot-gotify]` | `internal/bot/gotify/*.go` | Gotify 推送 |
| `[bot-pushover]` | `internal/bot/pushover/*.go` | Pushover 推送 |
| `[bot-telegram]` | `internal/bot/telegram/*.go` | Telegram bot |
| `[bot-wechat]` | `internal/bot/wechat/*.go` | WeChat bot |
| `[cli]` | `internal/cli/executor.go` | CLI 执行器 |
| `[config]` | `internal/config/*.go`, `internal/api/config_handlers.go` | 配置管理和 API |
| `[consolelog]` | `internal/consolelog/hub.go` | 控制台日志捕获系统 |
| `[cookies]` | `internal/api/cookie_handlers.go` | Cookie 操作 |
| `[db]` | `internal/api/db_handlers.go`, `resource_handler.go` | 数据库 REST API |
| `[download]` | `internal/service/download_service.go`, `internal/downloading/*.go` | 下载服务和业务 |
| `[download-queue]` | `internal/api/download_queue.go` | 下载任务队列 |
| `[downloader]` | `internal/downloader/*.go` | 单文件下载 |
| `[jsonfile]` | `internal/downloading/json_file_download.go`, `json_folder_download.go` | JSON 文件导入 |
| `[listener]` | `main.go` | 信号处理 |
| `[logs]` | `internal/api/log_handlers.go` | 日志查阅 API |
| `[MFQ]` | `internal/twitter/client.go` | 多账号任务队列 |
| `[profile]` | `internal/downloading/profile/*.go` | 用户资料下载 |
| `[RateLimiter]` | `internal/twitter/client.go` | 速率限制器 |
| `[schedules]` | `internal/api/scheduler_handlers.go` | 计划任务 REST API |
| `[scheduler]` | `internal/scheduler/scheduler.go` | 计划任务引擎 |
| `[server]` | `internal/api/server.go` | 服务器生命周期 |
| `[SSE]` | `internal/api/sse_*.go` | SSE 事件流 |
| `[startup]` | `main.go` | 启动阶段 |
| `[tasks]` | `internal/api/download_handlers.go` | 下载任务创建 |
| `[theme]` | `internal/api/server.go` | 主题切换 |
| `[twitter]` | `internal/twitter/*.go` | Twitter API 操作 |
| `[upload]` | `internal/api/download_handlers.go` | JSON 文件上传 |
| `[web]` | `internal/api/handlers.go` | Web UI 页面渲染 |
| `[WebUI]` | `internal/api/config_handlers.go`, `cookie_handlers.go`, `scheduler_handlers.go` | Web UI 配置保存 |

### 6.2 前缀使用规则

1. **所有层都必须使用前缀**：每个日志消息必须以 `[domain]` 开头
2. **前缀后的首字母大写**：`[api] Server starting` ✓, `[api] server starting` ✗
3. **CLI 用户面向输出**：`executor.go` 中的部分日志不使用前缀（如 `"start working for..."`），因为这些直接面向终端用户
4. **main.go 启动日志**：使用 `[startup]` 前缀，大小写统一

---

## 七、日志消费者

### 7.1 Web UI REST API

| 端点 | 方法 | 功能 |
|------|--------|----------|
| `GET /api/v1/logs` | ❌ | 分页查询日志 （支持 `level`, `q`, `start_time`, `end_time` 过滤） |
| `GET /api/v1/logs/stats` | 统计 | 各级别日志数量 |
| `GET /api/v1/logs/export` | 导出 | 下载 `tmd2.log` 完整文件 |
| `GET /api/v1/logs/stream` | SSE | 实时日志流 |

**日志 REST API 过滤参数**：

| 参数 | 类型 | 描述 |
|--------|------|-------------|
| `level` | string | 日志级别：`debug`, `info`, `warn`, `error`, `all` |
| `q` | string | 全文搜索（大小写不敏感） |
| `start_time` | string | 开始时间（RFC 3339 / `2006-01-02T15:04:05` / `2006-01-02`） |
| `end_time` | string | 结束时间 |
| `page` | int | 分页页码（默认 1） |
| `page_size` | int | 每页条数（默认 100，最大 200） |
| `sort` | string | 排序方式（default = 逆序） |

### 7.2 SSE 实时日志流

```go
func (s *Server) handleLogStream(w http.ResponseWriter, r *http.Request) {
    flusher, err := setupSSE(w)
    if err != nil {
        log.Errorf("[SSE] Log stream setup failed: %v", err)
        s.writeError(w, http.StatusInternalServerError, "Streaming not supported")
        return
    }

    levelStr := r.URL.Query().Get("level")
    if levelStr != "" && !isValidLogLevel(levelStr) {
        log.Debugf("[SSE] Invalid log level requested: %q", levelStr)
        s.writeError(w, http.StatusBadRequest, "Invalid log level: "+levelStr)
        return
    }
    search := r.URL.Query().Get("q")
    ctx := r.Context()
    ch, unsubscribe := s.logHub.Subscribe()
    defer unsubscribe()

    heartbeat := time.NewTicker(sseHeartbeatInterval)
    defer heartbeat.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-heartbeat.C:
            if err := writeSSEFrame(w, flusher, func() error {
                return writeSSEHeartbeat(w)
            }); err != nil {
                return
            }
        case line, ok := <-ch:
            if !ok {
                return
            }
            if line == "" {
                continue
            }
            if !matchLogFilters(line, levelStr, search) {
                continue
            }
            if err := writeSSEFrame(w, flusher, func() error {
                return writeSSEData(w, line)
            }); err != nil {
                return
            }
        }
    }
}
```

**SSE 事件格式**：
```
event: log
data: time="2026-07-05T10:30:00+08:00" level=info msg="[server] API server starting on :25556"
```

### 7.3 Bot 日志告警

所有 Bot 平台通过 `RunBotLogLoop()` 订阅日志：

```go
func RunBotLogLoop(lh *consolelog.Hub, stopCh <-chan struct{}, wg *sync.WaitGroup, fn func(line string)) {
    wg.Add(1)
    go func() {
        defer wg.Done()
        ch, unsub := lh.Subscribe()
        defer unsub()
        var lastLog time.Time
        for {
            select {
            case <-stopCh:
                return
            case line, ok := <-ch:
                if !ok {
                    return
                }
                if !strings.Contains(line, "level=error") && !strings.Contains(line, "level=fatal") {
                    continue
                }
                now := time.Now()
                if now.Sub(lastLog) < time.Second {
                    continue
                }
                lastLog = now
                fn(line)
            }
        }
    }()
}
```

**告警行为**：
- 只发送 `level=error` 和 `level=fatal` 级别的日志
- 1 秒内最多发送 1 条告警，防止告警风暴
- 所有平台共享此函数，一致性由 `bot_notify.go` 保证

---

## 八、各层日志使用统计

### 8.1 按日志级别分布

| 层 | Debugf | Infof | Warnf | Errorf | Fatalln | 总计 |
|-----|--------|-------|-------|--------|---------|-------|
| main.go | 1 | 11 | 1 | 0 | 6 | 19 |
| api/ | 31 | 14 | 18 | 39 | 0 | 102 |
| service/ | 0 | 3 | 17 | 5 | 0 | 25 |
| downloading/ | 12 | 27 | 36 | 20 | 0 | 95 |
| downloader/ | 6 | 0 | 8 | 0 | 0 | 14 |
| profile/ | 5 | 4 | 0 | 9 | 0 | 18 |
| twitter/ | 11 | 1 | 3 | 0 | 0 | 15 |
| scheduler/ | 8 | 6 | 5 | 0 | 0 | 19 |
| config/ | 0 | 0 | 3 | 0 | 0 | 3 |
| bot/*/ | 0 | 3 | 10 | 0 | 0 | 13 |
| **总计** | **74** | **69** | **101** | **73** | **6** | **323** |

### 8.2 按层总调用数

| 包 | 日志调用数 | 占比 |
|-----|-------------|--------|
| `internal/api/` | 102 | 31.6% |
| `internal/downloading/` | 95 | 29.4% |
| `internal/service/` | 25 | 7.7% |
| `internal/scheduler/` | 19 | 5.9% |
| `internal/cli/` | 19 | 5.9% |
| `main.go` | 19 | 5.9% |
| `internal/downloader/` | 14 | 4.3% |
| `internal/twitter/` | 15 | 4.6% |
| `internal/downloading/profile/` | 18 | 5.6% |
| `internal/bot/*/` | 13 | 4.0% |
| `internal/config/` | 3 | 0.9% |
| **总计** | **323** | **100%** |

---

## 九、异常处理中的日志模式

### 9.1 API Handler 模式

每一个返回错误的 API handler 遵循以下模式：

```go
if err != nil {
    log.Errorf("[domain] Description of what failed: %v", err)
    s.writeError(w, http.StatusInternalServerError, "User-safe message")
    return
}
```

**规则**：
1. `log.Errorf` 记录完整错误（包含 `err.Error()`），便于服务端调试
2. `writeError` 只发送用户安全的消息，**不暴露**原始错误细节
3. 需要调试详情时使用 `writeErrorDetail`，但很罕见

### 9.2 下载层模式

下载层区分"可重试"和"不可重试"错误：

```go
// 不可重试（403/404）→ 跳过但记录级别
if isNonRetriableMediaError(err) {
    log.Infof("[download] Skip non-retriable media: %s - %v", u, err)
    continue
}

// 可重试 → 记录为 Warnf（非致命但需要关注）
log.Warnf("[download] Failed to download media (tweet %d): %s - %v", tweet.Id, u, err)
```

### 9.3 Bot 日志告警模式

所有 bot 平台共享：
- `log.Infof("[bot-xxx] Started")` — 启动成功
- `log.Warnf("[bot-xxx] Failed to ...: %v", err)` — 非致命操作失败
- RunBotLogLoop 筛选 `level=error`/`level=fatal` 发送到 bot 通知

---

## 十、日志文件结构

### 10.1 数据目录结构

```
{appRootPath}（默认 ~/.tmd2 或 %APPDATA%\.tmd2）
├── tmd2.log         ← 主日志文件（logrus 输出，lumberjack 轮转）
├── client.log       ← HTTP 客户端日志（独立 logrus 实例 → lumberjack 轮转，非全局 logrus）
└── conf.yaml        ← 主配置
```

### 10.2 轮转行为

| 属性 | 值 |
|----------|-------|
| 单个文件最大 | 2 MB |
| 保留备份数 | 2 |
| 保留天数 | 14 |
| 是否压缩 | 否 |
| 轮转文件名模式 | `tmd2.log` → `tmd2-{timestamp}.log` → 最旧删除 |

### 10.3 CLI 模式 vs Server 模式的日志差异

| 方面 | CLI 模式 | Server 模式 |
|------|-----------|-------------|
| `client.log` 日志 | lumberjack 自动轮转，MaxSize=2MB, MaxBackups=2, MaxAge=14 天 | 同 CLI 模式 |
| 日志输入目的地 | 控制台 + 文件 | 控制台（捕获）+ SSE + 文件 |
| 信号触发 | `cancel()` 取消上下文 | `GracefulShutdown()` 完整清理 |
| 日志 Hub 生命周期 | 随进程退出 | `logHub.Close()` 关闭订阅者 |

---

## 十一、结构化日志（downloader 层）

`internal/downloader/downloader.go` 是唯一使用 `log.WithFields` 结构化日志的层：

```go
type DefaultDownloader struct {
    logger log.FieldLogger  // = log.StandardLogger()
}

// 使用示例
d.logger.WithFields(log.Fields{
    "url":         req.URL,
    "status_code": resp.StatusCode(),
}).Warn("[downloader] Download failed with non-2xx status")
```

项目其余部分全部使用格式化字符串：
```go
log.Warnf("[downloader] Failed to compute file hash: %v, path: %s", hashErr, req.Path)
```

**当前不一致**：downloader 的结构化日志使用 `[downloader]` 前缀 + 大写的首字母，与非结构化的 `Warnf`/`Infof` 调用保持一致。但 Web UI 日志解析是基于字符串搜索（`level=warning`），结构化日志与之兼容。

---

## 十二、日志系统的关键设计决策总结

| 决策 | 理由 | 影响 |
|----------|---------|---------|
| stdout/stderr 管道劫持 | 捕获 C 库和第三方包的意外输出 | 可能导致某些情况下的控制台输出丢失 |
| lfshook + lumberjack 写文件 | 不侵入 logrus 标准输出；只处理文件写入，不处理轮转 | 增加一层间接调用 |
| 环形缓冲 5000 行 | 内存友好，避免无限增长的日志占用 | 早期日志丢失，不可恢复 |
| 订阅者缓冲 100 行 | 防止慢消费者阻塞日志系统 | 慢消费者会断开，丢失部分实时日志 |
| TextFormatter 替代 JSON | 人类可读，适合终端和文件 | 结构化解析困难，Web UI 依赖文本正则解析 |
| `[domain]` 前缀约定 | 快速定位日志来源 | 需要在每个日志调用中手动维护前缀，无编译期检查 |
| 没有 `log.WithFields` | 保持一致性（除 downloader 外） | 不利于日志聚合工具（ELK/Loki）的结构化查询 |
| 错误日志不暴露 `err.Error()` 给用户 | 安全最佳实践：防止信息泄露 | 调试需要关联服务端日志 |

---

## 十三、相关文件

```
main.go                           → 日志初始化（initLogger, lumberjack 配置）
internal/consolelog/hub.go        → Hub 环形缓冲区, 管道捕获, 订阅者管理
internal/consolelog/hub_test.go   → Hub 测试（环形缓冲区, 管道, 订阅者, 并发）
internal/api/log_handlers.go      → REST API：获取/统计/导出日志
internal/api/sse_logs.go          → SSE 实时日志流
internal/api/bot_notify.go        → Bot 日志告警循环（RunBotLogLoop）
internal/api/web/web1/app.js      → 前端日志时间戳高亮
```
