# TMDP 日志系统实现文档

> 基于当前代码审计后的日志实现说明。最后校准：2026-08-04。

本文档描述 TMDP 当前日志栈、日志输出约定、Web UI 消费路径、Bot 告警路径，以及维护日志时需要遵守的实现规则。它以真实代码为准。

---

## 1. 评估结论

这次评估发现旧文档主要问题是：依赖版本过时、文件 Hook 描述错误、轮转压缩配置错误、日志格式仍按旧结构描述、`duration=` 字段未同步为 `dur=`、Bot 告警和 Web 时间解析没有覆盖当前 `INFO[...]`/`ERRO[...]` 格式。

已同步完善：

- 文档改为当前 `logrus + custom LumberjackHook + lumberjack + consolelog.Hub` 实现。
- 说明 `Compress: true`、`logrus v1.9.4`、`lumberjack v2.0.0+incompatible`。
- 补充 `StopCapture()` 恢复 logrus 输出的 shutdown 保护。
- 补充 `dur=`、`task_id`、路径规范、敏感信息脱敏规范。
- 日志 API 只按当前 `LEVEL[...+08:00]` 格式解析时间戳。
- Bot 告警只按当前 `ERRO[...]`/`FATA[...]` 格式识别错误级日志。
- 修复三套 Web UI 主题（web1/web2/web3，web3 自 v3.7.2 起）对 `FATA[...]` 和带时区 TextFormatter 时间戳的高亮。

---

## 2. 日志栈概览

```
业务日志
  main.go
  internal/api
  internal/service
  internal/downloading
  internal/downloader
  internal/twitter
  internal/scheduler
  internal/cli
  internal/bot/*
        |
        v
logrus 全局 logger
  TextFormatter{ForceColors, FullTimestamp, DisableSorting}
  InfoLevel / DebugLevel
        |
        +--> os.Stderr
        |      |
        |      v
        |   consolelog.Hub
        |     - stdout/stderr pipe capture
        |     - ANSI stripping
        |     - 5000-line ring buffer
        |     - Subscribe() for Web SSE and Bot loops
        |
        +--> internal/logging.LumberjackHook
               |
               v
            lumberjack.Logger
              - tmd2.log
              - 2 MB rotation
              - 2 backups
              - 14 days
              - gzip compression enabled
```

核心文件：

- `main.go`：初始化 logrus、lumberjack、consolelog。
- `internal/logging/lumberjack_hook.go`：自定义 logrus Hook，替代未维护的 `lfshook`。
- `internal/logging/sanitize.go`：ANSI 移除、URL/secret 脱敏、路径可读化。
- `internal/consolelog/hub.go`：终端捕获、环形缓冲、订阅。
- `internal/api/log_handlers.go`：日志列表、统计、导出。
- `internal/api/sse_logs.go`：实时日志 SSE。
- `internal/api/bot_notify.go`：Bot 日志告警循环。
- `internal/api/web/web1/app.js`、`internal/api/web/web2/app.js`、`internal/api/web/web3/app.js`：日志颜色和时间戳高亮（web3 自 v3.7.2 起，仅对 ERROR/FATA/WARN 着色）。

---

## 3. 依赖和文件输出

当前 `go.mod` 中直接相关依赖：

| 依赖 | 当前版本 | 用途 |
| --- | --- | --- |
| `github.com/sirupsen/logrus` | `v1.9.4` | 全局日志库 |
| `github.com/natefinch/lumberjack` | `v2.0.0+incompatible` | 主日志和 HTTP client 日志轮转 |
| `github.com/gookit/color` | `v1.6.1` | 少量终端彩色文本 |
| `gopkg.in/natefinch/lumberjack.v2` | `v2.2.1` indirect | 间接依赖，不是主日志实现入口 |

当前不使用 `github.com/rifflock/lfshook`。文件日志通过 `internal/logging.LumberjackHook` 写入，Hook 写入前会调用 `logging.StripANSI()`，避免彩色控制符进入 `tmd2.log`。

主日志文件（实际由 `logging.NewRotatingWriter` 工厂构造，`internal/logging/rotation.go:11-21`，单文件 2MB、2 份备份、14 天、gzip 压缩）：

```go
logWriter := logging.NewRotatingWriter(filepath.Join(appRootPath, "tmd2.log"))
```

HTTP client 日志：

```go
cliLogWriter := logging.NewRotatingWriter(filepath.Join(appRootPath, "client.log"))
```

---

## 4. 初始化和关闭顺序

初始化入口是 `main.go:initLogger`：

```go
func initLogger(dbg bool, logFile io.Writer, logHub *consolelog.Hub) {
    formatter := logging.NewTextFormatter()
    formatter.ForceColors = true // 终端彩色；文件端由 LumberjackHook 剥离 ANSI
    log.SetFormatter(formatter)

    if dbg {
        log.SetLevel(log.DebugLevel)
    } else {
        log.SetLevel(log.InfoLevel)
    }

    if err := consolelog.StartCapture(logHub); err != nil {
        log.Warnf("[startup] Console log capture failed error=%q", err.Error())
    } else {
        log.SetOutput(os.Stderr)
    }
    log.AddHook(logging.NewLumberjackHook(logFile))
}
```

关键点：

- formatter 由 `logging.NewTextFormatter()`（`internal/logging/rotation.go:24-33`）构造：`FullTimestamp`、`DisableSorting`、`PadLevelText: false`；主日志终端端覆盖 `ForceColors = true`（文件端由 LumberjackHook 剥离 ANSI），HTTP client 日志端覆盖 `DisableQuote = true`。
- `consolelog.StartCapture()` 替换 `os.Stdout` 和 `os.Stderr` 为 pipe writer。
- `capturePipe()` 把内容写回原始终端，同时逐行写入 Hub。
- logrus 输出指向当前 `os.Stderr`，所以终端和 Web UI 都能看到同一条日志。
- `LumberjackHook` 作为额外 sink 写文件，不依赖 stderr。
- `Server.GracefulShutdown()` 不再提前关闭主日志 writer，避免 shutdown 尾声继续写日志时报 `file already closed`。
- `consolelog.StopCapture()` 会恢复 `os.Stdout`/`os.Stderr`，并在 logrus 仍指向捕获 pipe 时恢复 logrus 输出。
- 最终文件 writer 由 `main` 的 defer 释放。

---

## 5. 当前日志格式

终端和 Hub 中的常见格式：

```text
INFO[2026-07-29T04:55:01+08:00] [server] Graceful shutdown started reason="signal:interrupt"
WARN[2026-07-29T04:55:01+08:00] [download] Retry skipped reason=no_retry pending_tweets=2
ERRO[2026-07-29T04:55:01+08:00] [download-queue] Task panic task_id=task_xxx error="..."
```

- Web 日志 level 筛选使用 `DEBU[`、`INFO[`、`WARN[`、`ERRO[`、`FATA[` 前缀。
- 时间过滤解析 `LEVEL[RFC3339]` 这类 TextFormatter 时间戳。
- 三套 Web UI 主题的日志高亮：web1（`getLineLevel`/`levelRegex`）与 web2（`getLogLineColor`）完整支持 `FATA`、`ERRO`、`WARN`、`INFO`、`DEBU` 五级并支持带时区的 `+08:00` 时间戳；web3（v3.7.2 起，`app.js` 中 `logLoadReplace`/`logLoadMore`/`logConnect` 的着色逻辑）仅对包含 `ERROR`/`FATA`/`WARN` 的行着色。
- Bot 告警支持 `ERRO[`、`FATA[`。

---

## 6. consolelog.Hub

`consolelog.Hub` 是 Web UI 和 Bot 的实时日志来源。

数据结构要点：

- 默认环形缓冲：`DefaultLimit = 5000`。
- 每个订阅者 channel 缓冲：`subscriberBuffer = 100`。
- `Hub.Add()` 会 trim、strip ANSI、忽略空行。
- 订阅者满缓冲时会被关闭，并输出：

```text
WARN[...] [consolelog] Slow subscriber closed reason=queue_overflow
```

生命周期：

- `StartCapture()` 是幂等的；已有 active capture 时直接返回。
- `StopCapture()` 是幂等的；没有 active capture 时无操作。
- `Hub.Close()` 会关闭订阅者并停止 capture。
- capture goroutine 由 `captureWg` 等待退出，避免关闭后仍有后台读取。

---

## 7. Web 日志 API

路由来自 `internal/api/server.go`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/logs` | 从 Hub 快照分页读取日志 |
| `GET` | `/api/v1/logs/stats` | 统计 debug/info/warn/error/total |
| `GET` | `/api/v1/logs/export` | 导出当前 `tmd2.log` |
| `GET` | `/api/v1/logs/stream` | SSE 实时日志 |

`GET /api/v1/logs` 支持：

| 参数 | 说明 |
| --- | --- |
| `level` | `debug`、`info`、`warn`、`error`、`all` |
| `q` | 大小写不敏感搜索 |
| `domain` | 域前缀筛选，匹配行首 `[xxx]` 域（`log_handlers.go:29-30`；SSE 流同样支持，`sse_logs.go:24`） |
| `start_time` | `RFC3339`、`2006-01-02T15:04:05`、`2006-01-02` |
| `end_time` | 同 `start_time` |
| `page` | 页码 |
| `pageSize` / `page_size` | 每页数量，默认 100，最大 200 |
| `sort` / `sortOrder` | 使用通用分页解析 |

注意：

- `handleGetLogs()` 从 Hub 快照中逆序过滤，最新日志优先。
- `handleLogExport()` 导出的是当前 `tmd2.log`，不是 Hub 的 5000 行快照。
- `handleLogStats()` 将 fatal 计入 error 统计，避免错误类告警被漏到 info。
- Access log 使用 `logging.RequestTarget()`，会脱敏 `?token=` 等查询参数。

---

## 8. Bot 日志告警

`RunBotLogLoop()` 被 Telegram、Discord、Feishu、Gotify、Pushover、WeChat 复用。

行为：

- 订阅 `consolelog.Hub`。
- 只处理错误级别：`ERRO[`、`FATA[`。
- 1 秒内最多回调一次，避免错误风暴刷屏。
- Bot 平台自己的发送失败使用各自 `[bot-*]` 前缀记录为 Warn。

实现注意：

- 当前终端主格式是 `ERRO[...]`/`FATA[...]`，Bot 告警按这个格式筛选。
- Hub 中已经 strip ANSI，Bot 看到的是无颜色文本。
- Bot 日志告警不应该打印 token、secret、cookie。

---

## 9. 日志级别规范

| 级别 | 使用场景 | 示例 |
| --- | --- | --- |
| Debug | 内部细节、高频轮询、解析失败、无工作可做的常态跳过、低层 helper 失败细节 | `Retry skipped reason=no_pending_tweets` |
| Info | 用户可理解的生命周期边界、正常完成、配置保存、任务创建/开始/完成 | `Media batch start`、`Complete dur=...` |
| Warn | 可恢复但影响结果、用户预期可能落空、限流等待、部分失败、禁用 retry 且存在待重试项 | `Protected users skipped`、`Retry skipped reason=no_retry pending_tweets=...` |
| Error | 当前操作失败、内部一致性风险、panic recovery、启动后服务级失败 | `Store path failed`、`Task panic` |
| Fatal | 启动期无法继续 | 配置加载失败、登录失败、DB 连接失败、server 启动失败 |

HTTP access log 规则：

- `GET`、`HEAD`、`OPTIONS` 成功：Debug。
- mutating request 成功：Info。
- `status >= 400`：Warn。
- 日志格式：`[api] METHOD /path status=... dur=... ip=...`。

---

## 10. 字段和可读性规范

推荐字段：

- `task_id`：任务边界和错误定位。
- `type`：任务/资源类型。
- `target`：用户、列表、batch 摘要。
- `path`：文件路径，必须走 `logging.Path()`。
- `url`：外部 URL，必须走 `logging.SanitizeURL()`。
- `dur`：耗时字段，统一不用 `duration=`。
- `reason`：跳过、降级、恢复、拒绝的原因。
- `error`：错误文本，可能含敏感信息时必须走 `logging.RedactSensitiveText()` 或领域内安全包装。

避免：

- 同一失败在低层和边界层重复 Warn/Error。
- 成功下载每个媒体文件都打 Info。
- 用 `fmt.Print*` 做进度日志。
- 输出原始 token、cookie、JWT、Authorization、带 token 的 URL。
- Windows 路径直接用反斜杠刷屏。

路径规则：

```go
log.Infof("[db] Connected path=%q", logging.Path(pathHelper.DB))
```

URL 规则：

```go
log.Warnf("[download] Failed media tweet_id=%d url=%s error=%q",
    tweet.Id,
    mediaURLForLog(u),
    logging.RedactSensitiveText(err.Error()),
)
```

---

## 11. 业务日志分层

### 11.1 Task

`internal/api/task_log.go`：

- `Created`、`Started`、`Failed` 带 `task_id`。
- `Completed`、`Cancelled` 不重复 `task_id`。
- 耗时字段是 `dur`。
- 错误文本走 `logging.RedactSensitiveText()`。
- enqueue 日志不重复 task id，只打印 `type`、`target`、`queue_depth`。

### 11.2 Download service

`internal/service/download_service.go`：

- 任务级 start 带 `task_id` 和 options。
- 阶段 start 带 `task_id`。
- 阶段 complete 省略重复 task id，聚焦 counts 和 `dur`。
- `no_pending_tweets` 是 Debug。
- `no_retry` 且存在 pending failures 是 Warn。
- `Retry all` 输出 skipped/complete/incomplete 汇总。
- `Profile skipped` 必须带 reason。

### 11.3 Downloading helpers

`internal/downloading/*`：

- batch collect/preprocess 内部细节 Debug。
- protected unfollowed skipped 是 Warn。
- JSON file/folder 文件级完成是 Info，部分失败是 Warn。
- 低层 helper 若错误会立即返回且调用方已记录用户可见失败，则低层使用 Debug。

### 11.4 Downloader

`internal/downloader/*`：

- 单文件下载不使用 `log.WithFields`，而是通过自定义 `orderedLogFields`（`internal/downloader/downloader.go:74-96`）手工拼接 `key=value` 字段，logger 为 `log.StandardLogger()`（downloader.go:121）；`tweet_id` 优先排在最前，其余字段按 key 排序，再追加调用方传入字段。
- `DownloadRequest.LogFields` 用于透传 `tweet_id` 等上下文。
- URL 必须 sanitize。
- 流式下载 retry/fallback 是 Warn；模式选择是 Debug。
- 原子写成功是 Debug。

### 11.5 Scheduler

`internal/scheduler/scheduler.go`：

- start/stop/reload/recovered/restarted 是 Info。
- stale generation 是 Debug，因为 reload 后旧循环退出是预期行为。
- empty task id、status mismatch、invalid schedule index 是 Warn。
- panic 是 Error。

### 11.6 Twitter

`internal/twitter/*`：

- `[twitter]` 用于账号、用户、解析上下文。
- `[rate-limit]` 用于限流、端点、客户端选择、等待。
- sleep/no-client 是 Warn。
- client selection、parser skip、request count 是 Debug。
- endpoint 和 error 通过 `internal/twitter/logging.go` 清洗。

### 11.7 API 和配置

`internal/api/*`：

- 用户输入解析失败通常 Debug。
- 配置/cookie/schedule 写入成功 Info。
- backup 创建失败 Warn。
- 文件读取/写入失败、DB 操作失败 Error。
- auth middleware 的普通失败 Debug；登录 API key mismatch 和 rate limit 是 Warn。

### 11.8 Bot

`internal/bot/*`：

- 启动成功 Info。
- 发送失败 Warn。
- 不输出 token/secret。
- provider 前缀使用 `[bot-telegram]`、`[bot-discord]` 等。

---

## 12. 前缀清单

常用前缀：

| 前缀 | 领域 |
| --- | --- |
| `[startup]` | 启动阶段 |
| `[server]` | API server 生命周期 |
| `[api]` | HTTP access 和通用 API |
| `[auth]` | API 认证 |
| `[task]` | 任务状态 |
| `[tasks]` | 任务执行（run 函数构建失败等，`download_handlers.go:48,481,530`） |
| `[download-queue]` | 下载队列 |
| `[download]` | 下载服务和下载业务 |
| `[batch]` | 批量下载内部阶段 |
| `[downloader]` | 单文件下载 |
| `[profile]` | profile/avatar/banner 下载 |
| `[jsonfile]` | 第三方 JSON 文件导入 |
| `[jsonfolder]` | `.loongtweet` 文件夹导入 |
| `[scheduler]` | scheduler 引擎 |
| `[schedules]` | scheduler 配置 API |
| `[twitter]` | Twitter API |
| `[rate-limit]` | Twitter rate limit |
| `[db]` | 数据库 API 或 DB 连接 |
| `[config]` | 主配置 |
| `[cookies]` | additional cookies |
| `[logs]` | 日志 API |
| `[sse]` | SSE |
| `[upload]` | 上传处理 |
| `[theme]` | Web UI 主题 |
| `[web]` | Web 页面服务（如首页加载失败，`handlers.go:109`） |
| `[bot]` / `[bot-*]` | Bot 生命周期和平台日志 |
| `[consolelog]` | 控制台捕获 |
| `[cli]` | CLI 执行 |

规则：

- 用户可见日志必须有 `[domain]` 前缀。
- 前缀使用小写为主：`[sse]`、`[rate-limit]`，不再使用旧文档里的 `[SSE]`、`[RateLimiter]`。
- 事件短语使用英文 Title Case 或短动词短语，后接 `key=value`。

---

## 13. 当前日志调用分布

截至 2026-07-29 审计时（2026-08-04 复核 Info 列），源码日志调用热点如下：

| 包/入口 | Debug | Info | Warn | Error/Fatal | 评估 |
| --- | ---: | ---: | ---: | ---: | --- |
| `internal/api` | 38 | 22 | 50 | 37 | API 错误面广，等级基本合理 |
| `internal/downloading` | 50 | 27 | 37 | 21 | 已降低低层重复 Error |
| `internal/service` | 5 | 22 | 22 | 15 | 已补 retry/profile 汇总和 skip reason |
| `internal/scheduler` | 16 | 9 | 10 | 1 | 已将 stale generation 降为 Debug |
| `internal/twitter` | 23 | 1 | 4 | 0 | 限流和解析分层合理 |
| `internal/bot` | 0 | 8 | 21 | 0 | 启动/发送失败分层合理 |
| `internal/cli` | 0 | 8 | 11 | 2 | CLI 模式选择和失败分层合理 |
| `main.go` | 1 | 7 | 7 | 9 | 启动期 Fatal 合理 |

统计只是辅助，不是质量目标。日志质量以是否能解释生命周期、失败原因、用户影响和后续动作作为判断标准。

---

## 14. 维护 checklist

改日志时请检查：

- 是否需要 `lat.md/logging.md` 同步更新。
- 是否会让正常路径刷屏。
- 是否该用 Debug 而不是 Info/Warn。
- 是否需要 `task_id`、`tweet_id`、`target`、`path`、`url`、`dur`。
- `path` 是否用了 `logging.Path()`。
- URL/token/error 是否脱敏。
- 是否造成低层和外层重复 Warn/Error。
- Web UI 是否能按 level、time、search 过滤。
- Bot 是否能收到真正的 Error/Fatal。
- `lat check` 和相关 Go 测试是否通过。

建议验证：

```powershell
go test -count=1 ./internal/api ./internal/consolelog ./internal/logging ./internal/downloader ./internal/downloading ./internal/scheduler ./internal/service ./internal/twitter
lat check
git diff --check
```
