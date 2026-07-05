# TMD 日志系统完善文档

> 基于对全部日志相关代码（main.go initLogger、internal/consolelog/hub.go 332 行、internal/api/log_handlers.go、internal/api/sse_logs.go、internal/api/bot_notify.go 以及 30+ 个文件中约 323 处 log.* 调用）的深入审查，整理出以下改进项。
>
> 每项评估了影响范围、风险和收益，按优先级分组。

---

## 一、P0 — 必须修复（Bug / 数据丢失 / 安全隐患）

### 1.1 lumberjack 双重依赖

**问题**：go.mod 中存在两条 lumberjack 条目：
```
require (
    github.com/natefinch/lumberjack v2.0.0+incompatible  // import 路径
    ...
)
require (
    gopkg.in/natefinch/lumberjack.v2 v2.2.1 // indirect，同一库的 canonical 模块路径
)
```

`github.com/natefinch/lumberjack` 是 v2 但仓库无 go.mod，Go 用 `+incompatible` 标记。`gopkg.in/natefinch/lumberjack.v2` 是同一库的 canonical 模块路径。`go mod why` 显示它是自身测试依赖的传递，**不会导致二进制膨胀**（两者编译为同一包）。

**真正修复**：将 `main.go` 的 import 从 `github.com/natefinch/lumberjack` 改为 `gopkg.in/natefinch/lumberjack.v2`，然后 `go mod tidy` 移除旧的 direct 条目。

**优先级**：P2（不造成实际问题，仅有代码整洁意义）
**影响范围**：`main.go` + `go.mod`
**风险**：低
**验证**：`go build ./...` + `go mod verify`

---
### 1.2 Hub `Add` 方法中的 nil/静默丢失日志

**问题**：`hub.go:Add` 中的 ANSI 剥离逻辑会**丢弃**空行（`TrimSpace` 后为空字符串的行被 `if line == "" { return }` 跳过）。这意味着：
- 仅包含空白字符的日志行丢失（不太严重）
- 如果 `stripANSI` 将来出现 bug，可能导致异常行也被丢弃

此外，`stripANSI` 正则 `\x1b\[[0-9;]*[a-zA-Z]` 匹配 ANSI 转义序列。该正则不捕获某些 SGR 序列（如 `\x1b[38;2;255;255;255m` 中的 24 位颜色），可能存在 ANSI 泄漏到日志中。

**修复**：无需紧急修复。当前行为是可接受的。跟踪项以备审计。

**影响范围**：`internal/consolelog/hub.go`
**风险**：低

---

## 二、P1 — 高优先级（操作性痛点 / 低效 / 一致性）

### 2.1 Consolelog hub 关闭竞态

**问题**：`capturePipe` goroutine 在读取管道，而 `StopCapture` / `Close` 关闭管道写入端。当前实现没有协调这两个操作的机制：

```go
// 关闭顺序
// 1. logHub.Close() — 关闭所有订阅者的 channel
// 2. captureSession 关闭 — 关闭管道写入端
// 3. capturePipe goroutine — 从管道读取端读取 EOF

// 潜在竞态：
// 如果 capturePipe 正在写入 hub 的订阅者列表，而 Close 正在清空订阅者列表
// hub.mu 保护了订阅者列表，所以这是安全的
```

**当前是安全的**（`hub.mu` 保护了关键路径），但 `Close` 不等待 capture goroutine 结束可能导致文件描述符泄漏。大型的重启循环可能耗尽 FD。

**修复**：在 `Hub` 中添加 `WaitGroup` 追踪 capture goroutine，在 `Close` 中等待它们完成。

```go
type Hub struct {
    captureWg sync.WaitGroup  // 新增
    // ... 现有字段
}

func StartCapture(h *Hub) error {
    // ...
    h.captureWg.Add(2)  // stdout + stderr
    // ...
}

func (h *Hub) Close() {
    h.mu.Lock()
    for sub := range h.subscribers { sub.close() }
    h.subscribers = make(map[*logSubscriber]struct{})
    h.mu.Unlock()
    h.captureWg.Wait()  // 等待 capture goroutine 完成
}
```

**影响范围**：`internal/consolelog/hub.go`（+15 行）
**风险**：中等（改变了 Hub 生命周期）
**验证**：`go test -race ./internal/consolelog/...`

---

### 2.2 日志消息中缺少调用者位置（Caller）

**问题**：logrus `SetReportCaller` 未启用，日志里看不到源代码位置。对于有 60+ 个 `log.Errorf` 调用的项目来说，没有调用者信息导致：
- 查看日志时无法快速定位代码位置
- 添加新日志的新开发人员没有"自动"上下文

```go
// 当前: log.SetFormatter(&log.TextFormatter{...})
// 未调用: log.SetReportCaller(true)

// 启用后会添加:
// time="..." level=error msg="[...]" caller="internal/api/db_handlers.go:115"
```

**注意**：启用 `SetReportCaller(true)` 有性能开销（每行日志 ~500ns），且文件路径会暴露在日志中。

**建议**：**不启用**全局 caller 报告。改为：维护现有 `[domain]` 前缀约定（已经很好地定位了来源），并添加一个**轻量级检查脚本**确保每个日志调用都有 `[domain]` 前缀。

**影响范围**：不需要改动代码
**风险**：无
**替代方案**：添加 `scripts/check-log-prefix.go` 静态分析工具

---

### 2.3 日志级别不一致（Warnf ↔ Errorf 误用）

**问题**：审查发现多处在 Errorf 和 Warnf 使用上不一致：

| 位置 | 当前 | 应该是 | 理由 |
|----------|-------|------------|---------|
| `batch_download.go:170` | `log.Warnf("[batch] ✗ %s - failed to follow user: %v")` | 可以接受 | Follow 本身是努力争取的，失败不致命 |
| `profile/downloader.go:384` | `log.Errorln("[profile] Profile download failed:")` | 可以接受 | 已有错误处理路径 |
| `db_handlers.go:442` | `log.Errorf("[db] Invalid name: %v")` | 应该是 `Debugf` | 纯输入验证，不属于"错误" |
| `db_handlers.go:115` | `log.Errorf("[db] QueryUsers failed: %v")` | 可以接受 | 数据库失败返回 500，正确使用了 Errorf |
| `auth_jwt.go:107` | `log.Errorf("[auth] API key is not configured")` | 应该是 `Warnf` | 非运行时错误，是配置缺失 |
| `scheduler/scheduler.go:128` | `log.Infof("[scheduler] Scheduler started")` | 可以接受 | 正常状态变化 |

**具体不一致项**：


**① `db_handlers.go:442` — 输入验证用 Errorf**
```go
// 当前: 输入验证错误用 Errorf
log.Errorf("[db] Invalid name: %v", err)
// 应该:
log.Debugf("[db] Invalid name: %v", err)
```
影响：输入验证失败不属于服务端错误，不应触发 Error 告警。

**② `auth_jwt.go:107` — 配置缺失用 Errorf**
```go
// 当前: 配置缺失用 Errorf  
log.Errorf("[auth] API key is not configured")
// 应该:
log.Warnf("[auth] API key is not configured")
```
影响：缺少 API key 是正常状态（向后兼容），不是错误。

**修复**：逐项修复以上 2 处不一致。
**影响范围**：2 个文件，2 行代码
**风险**：低
**验证**：`go build ./...`

---

### 2.4 错误日志缺少任务关联标识

**问题**：错误路径均有日志记录，但日志中缺少 taskID 或上下文标识，无法将错误追溯到具体下载任务。例如 `markSingleUserWithInfo` 出错后只能看到 `"error: ..."` 字符串，看不到是哪个任务、哪个用户触发的。

**建议**：在关键错误路径的日志中添加 `task_id` 或 `user` 字段（如 `log.Errorf("[domain] task=%s user=%s ...: %v", taskID, user, err)`），便于 Web UI 日志查看器关联排查。

**影响范围**：service/downloading 层 ~10 处日志
**风险**：低（仅追加参数）
---

## 三、P2 — 中等优先级（性能 / 可维护性 / 增强）

### 3.1 日志旋转压缩缺失

**问题**：lumberjack 配置 `Compress: false`。在 Server 模式下：
- 每 2MB 滚动一次，保留 2 个备份 + 当前文件
- 未压缩时，2 个备份占用 ~4MB，对于磁盘小的系统可能是问题

**修复**：
```go
logWriter := &lumberjack.Logger{
    Compress: true,  // 改为 true
    // ...
}
```

**影响范围**：`main.go:100-106`（1 行）
**风险**：低。CPU 开销极小（后台压缩 goroutine）
**验证**：确认 `.gz` 后缀的轮转文件生成

---

### 3.2 日志文件不可查询——缺少结构化日志

**问题**：除 `downloader` 包外，整个项目使用格式化字符串日志：

```go
log.Infof("[db] QueryUsers failed: %v", err)
```

而不是结构化日志：

```go
log.WithFields(log.Fields{
    "error": err,
}).Error("[db] QueryUsers failed")
```

这意味着：
- 无法用 ELK/Loki/Grafana 对日志做结构化查询
- 无法按字段聚合（`count by error`、`sum by user`）
- 搜索依赖于文本匹配（`grep "level=error"`）

**建议**：**不建议**全量迁移到 `WithFields`。项目使用 TextFormatter 输出到文件，结构化日志在文本格式下可读性差。建议在需要聚合的场景（生产环境）配置 JSONFormatter：

```go
// 示例: 生产模式切换为 JSON
if production {
    log.SetFormatter(&log.JSONFormatter{})
}
```

或使用独立的日志路径输出 JSON 格式。

**影响范围**：不紧急，不需要当前改

---

### 3.3 SSE 日志流在服务端不做过滤

**问题**：`sse_logs.go` 中的日志过滤（级别、搜索）在**客户端**的 goroutine 中进行：

```go
// current: 每个 SSE 连接独立过滤
for {
    select {
    case line, ok := <-ch:
        if !matchLogFilters(line, levelStr, search) {
            continue  // 过滤掉不需要的行
        }
        writeSSEData(w, line)
    }
}
```

这意味着：
- 如果连接 100 个 Web UI 标签页，每个都接收全部日志后再过滤
- Hub 的 `send()` 必须分发每条日志到所有订阅者，浪费带宽

**建议**：对于当前的使用模式（通常 1-2 个 Web UI 标签页），此问题不关键。如果未来需要大规模扩展，可以在 Hub 中添加基于级别的过滤订阅。

**影响范围**：不需要当前改动

---

### 3.4 `lfshook` 版本极老（v0.0.0-20180920）

**问题**：`github.com/rifflock/lfshook` 的最后更新是 2018 年。虽然 logrus API 自那以来变化不大，但：
- 潜在的兼容性问题（logrus v1.9.3 比 lfshook 新 5 年）
- 无安全更新
- 如果 logrus 未来有重大 API 变化，此依赖会成为阻塞项

**建议**：评估是否可以**替换 lfshook**。其实只需要一个将 logrus 输出写入 lumberjack 的 Hook。可以用 ~20 行自定义代码代替：

```go
type lumberjackHook struct {
    logger *lumberjack.Logger
}

func (h *lumberjackHook) Levels() []log.Level {
    return log.AllLevels
}

func (h *lumberjackHook) Fire(entry *log.Entry) error {
    line, err := entry.String()
    if err != nil {
        return err
    }
    _, err = h.logger.Write([]byte(line))
    return err
}
```

这样可以移除一个外部依赖，并完全控制 Hook 行为。

**影响范围**：`main.go` initLogger 函数 + 移除 `go.mod` 中的 lfshook
**风险**：低（替换行为完全等价）
**验证**：确认日志仍然写入 `tmd2.log`

---

## 四、P3 — 低优先级（建议 / 长期）

### 4.1 请求级的 Trace ID

**问题**：当前日志无法将同一个 HTTP 请求的多个日志关联起来。一个请求经过 `auth_middleware → handler → taskManager → downloadQueue → service → downloading → downloader`，涉及 5+ 个包的日志，但无法关联。

**建议**：在中间件层为每个 API 请求生成一个 `traceID`，通过 `context.Context` 传递，并在日志中添加 `[trace=xxx]`。这对于下载场景尤其有价值——当前无法将一个下载任务的"用户创建"日志和其"媒体下载"日志关联。

**影响范围**：全项目
**风险**：高（需要修改大部分 handler 和 log 调用）
**评估**：不要现在做。等到需要调试生产问题时再做。

---

### 4.2 Consolelog ANSI 剥离正则增强

**问题**：当前 ANSI 正则：
```go
var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
```

不匹配 24 位真彩色序列（`\x1b[38;2;R;G;Bm`）——其中的 `[0-9;]*` 不能匹配 `2` 之后的 `;R;G;B` 结构（因为 R/G/B 本身是数字，但实际 24 位彩色以 `38;2;` 开头，`[0-9;]*` 可以匹配 `38;2;255;255;255`，所以这个实际上是能匹配的）。

实际上这个正则 `\x1b\[[0-9;]*[a-zA-Z]` 可以匹配所有标准 SGR 序列，包括 24 位彩色。所以当前没问题。

**结论**：没有问题，跳过。

---

### 4.3 在 CLI 模式中添加控制台日志 Hub 关闭

**问题**：`main.go` 的 CLI 路径（非 Server 模式）没有显式关闭 consolelog Hub：

```go
// 服务器模式
defer consoleLogHub.Close()  // 通过 GracefulShutdown 关闭

// CLI 模式 — hub 从未关闭
```

CLI 模式进程退出后，Hub 自然销毁，所以没有问题。

**结论**：没有问题，跳过。

---

### 4.4 错误日志中暴露 `err.Error()` 到 `writeError`

**问题**：大部分日志遵循 `log.Errorf + writeError(userSafe)` 模式。但审查发现少数地方将 `err.Error()` 直接传递给了用户：

| 位置 | 代码 |
|----------|------|
| `config_handlers.go:65` | `s.writeErrorDetail(w, h, "Invalid request body", err.Error())` |
| `cookie_handlers.go:44` | `s.writeErrorDetail(w, h, "Invalid request body", err.Error())` |

这些是 `writeErrorDetail`（向用户展示错误详情）——在调试模式下是合理的。但**不应该**在生产配置中启用。

**建议**：保持现状，`writeErrorDetail` 本身就是设计用于调试的。没有安全问题。

**影响范围**：无

---

### 4.5 单元测试覆盖率提升

**当前状态**：
- `internal/consolelog/hub_test.go`: ~196 行测试，覆盖基本功能
- 没有 `log_handlers_test.go`
- 没有集成测试验证日志轮转

**建议**：
1. 为 `log_handlers.go` 的 `filterLogLinesReverse`、`matchLogFilters`、`matchLogLevel`、`parseLogTime` 等纯函数添加单元测试
2. 添加 `initLogger` 的测试（使用临时目录验证文件写入）
3. 使用 `httptest.NewServer` 测试日志 REST API

**影响范围**：`internal/api/log_handlers_test.go`（新文件）+ `main_test.go`
**风险**：低
**工作量**：~50 行测试代码

---

## 五、改进汇总优先级

| ID | 类别 | 问题 | 优先级 | 难度 | 文件数 | 行数 |
|-----|----------|-------|----------|--------|-------|------|
| 1.1 | 整洁 | lumberjack 模块路径别名 | P2 | 简单 | 2 | 1 |
| 2.1 | 竞态 | Hub 关闭不等待 capture goroutine [已修复] | P1 | 中等 | 1 | ~15 |
| 2.3 | 一致性 | 日志级别误用（2 处）[已修复] | P1 | 简单 | 2 | 2 |
| 2.4 | 可观测性 | 错误日志缺少任务关联标识 | P2 | 简单 | 5+ | ~10 |
| 3.1 | 优化 | 日志压缩未启用 [已修复] | P2 | 简单 | 1 | 1 |
| 3.4 | 维护 | lfshook 版本太老 [已修复] | P2 | 简单 | 2 | ~25 |
| 4.5 | 质量 | 缺少日志 handler 测试 | P3 | 中等 | 1 | ~50 |
| 4.1 | 增强 | 请求级 Trace ID | P3 | 困难 | 30+ | 全项目 |

---

## 六、快速开始（建议第一轮改完的清单）

以下条目**已在此轮实施**：
1. **2 处日志级别修复** —— `db_handlers.go:443` Errorf→Debugf, `auth_jwt.go:107,166` Errorf→Warnf
2. **lumberjack 启用压缩** —— `main.go:105,112` `Compress: true`
3. **Hub 关闭竞态** —— `hub.go` WaitGroup 追踪 capture goroutine，Close() 同步等待
4. **lfshook 替换** —— `internal/logging/lumberjack_hook.go` 自实现 Hook，移除 2018 年外部依赖

---

以下条目**建议下一轮实施**：
1. **切 lumberjack import 到 canonical 路径** —— `main.go` `import "gopkg.in/natefinch/lumberjack.v2"`
2. **修复缺少日志关联 ID** —— 在 service/downloading 关键错误日志追加 task_id

---

## 七、不推荐做的变更

| 提议的变更 | 不推荐原因 |
|-------------------|----------------|
| 全项目迁移到 `log.WithFields` | 当前 TextFormatter 文本格式下结构化日志可读性差；迁移成本高（323 处调用）；项目不是 ELK 部署 |
| 添加 `SetReportCaller(true)` | 性能开销，且 `[domain]` 前缀已足够定位日志来源 |
| 在 Hub 中添加服务端日志过滤 | 当前 Web UI 用户数少，不需要 |
| 添加请求级 Trace ID | 影响面太大（30+ 文件），收益在当前场景下有限 |
| 将 Hub 环形缓冲区从 5000 扩展到无限制 | 内存有限，5000 行在 Web UI 中足够展示 |
