# 项目架构

> 本文档面向开发者，描述项目分层、调用关系与开发约定。普通用户请读 [readme.md](../readme.md)。

## 主干调用关系

```text
main.go
  ├─ 读取配置 / 环境变量 / 日志 / 数据库 / Twitter 客户端
  ├─ CLI 模式 -> internal/cli
  └─ Server 模式 -> internal/api

internal/cli / internal/api
  └─ 统一调用 internal/service.DownloadService

internal/service
  └─ 编排 downloading / downloader / twitter / database / path
```

整体上采用"入口层 + 应用服务层 + 业务层 + 基础设施层"的结构，核心复用点是 **`internal/service`**：CLI 和 API Server 共用同一套下载编排逻辑，避免两边各自维护一份下载流程。

`internal/api` 的 HTTP 路由集中在 `server.go`，除下载、任务与配置端点外，还提供下载页聚合端点 `GET /api/v1/download/context`、任务服务端查询 `GET /api/v1/tasks/query` 与批量任务操作 `POST /api/v1/tasks/batch/{cancel,retry,delete}`；任务结果 `TaskResult` 带可选 `failed_details`（最多 50 条失败明细）。

## 完整分层图

```
┌─────────────────────────────────────────────────────────────┐
│  main.go (应用入口层)                                         │
│  - 预解析全局参数                                             │
│  - 初始化配置、日志、数据库、Twitter 客户端                      │
│  - 模式选择：Server / CLI                                    │
└──────────┬──────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│  internal/config (配置层)                                    │
│  - config.go: 配置结构、读写、环境变量覆盖、交互式配置             │
└──────────┬──────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────┐  ┌─────────────────────▼─────────────────────────┐
│  internal/twitter            │  │  internal/database                            │
│  (API 客户端层)               │  │  (数据持久化层)                                  │
│                              │  │                                               │
│  - client.go: 登录与客户端管理 │  │  - connect/sqlite/schema                       │
│  - api.go: 请求封装与通用能力  │  │  - sqlite_schema/sqlite_migration              │
│  - user/tweet/list/timeline  │  │  - model/query/helpers                        │
│  - batch_login.go: 多账号     │  │  - user/lst/user_entity/lst_entity            │
│                              │  │  - user_link/user_sync                        │
│                              │  │  - path_validation                            │
│                              │  │  - tx/manager                                 │
└──────────┬───────────────────┘  └────────────────────────┬──────────────────────┘
           │                                               │
           └────────────────┬──────────────────────────────┘
                            │
          ┌─────────────────▼───────────────────────────┐
          │  🎯 internal/service (Service 层)           │
          │        ★ 核心业务编排层 ★                    │
          │                                             │
          │  - interfaces.go: DownloadService 接口       │
          │  - download_service.go: 用户/列表/关注/       │
          │    JSON/Profile/重试等统一入口                 │
          │  - deps.go: 依赖注入与构造                     │
          │  - progress.go: 进度上报                      │
          └─────────────────┬───────────────────────────┘
                            │
          ┌─────────────────┼───────────────────────────┐
          │                 │                           │
┌─────────▼────────┐   ┌────▼───────────┐     ┌─────────▼─────────┐
│  internal/api    │   │  internal/cli  │     │  internal/path    │
│  (Server 层)     │   │  (CLI 层)       │     │  (路径工具)        │
│                  │   │                │     │                   │
│  - server.go     │   │  - args.go     │     │  - store.go       │
│  - download_*    │   │  - executor.go │     │                   │
│  - task_manager  │   │                │     │                   │
│  - download_queue│   │                │     │                   │
│  - progress / sse│   │                │     │                   │
│  - db/config/    │   │                │     │                   │
│    cookie/log_*  │   │                │     │                   │
│  - scheduler_*   │   │                │     │                   │
│  - event_bus.go  │   │                │     │                   │
└────────┬─────────┘   └────────────────┘     └───────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  internal/downloading (业务流程层)                           │
│                                                             │
│  - batch_any.go / batch_download.go                         │
│  - tweet_download.go / user_sync.go / list_sync.go          │
│  - list_download.go / json_file_download.go / json_folder_download.go │
│  - mark_downloaded.go / retry.go / dumper.go                │
│  - entity.go / types.go / tweet_json_converter.go           │
│  - 负责抓取、同步实体、组织批量下载、失败重试                       │
├─────────────────────────────────────────────────────────────┤
│  internal/downloading/profile (Profile 业务子包)             │
│  - downloader.go / storage.go / types.go                    │
│  - 负责头像、横幅、简介、profile.json 与版本备份                  │
└──────────┬──────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│  internal/entity (数据实体层)                                 │
│  - interface.go / user.go / list.go / sync.go               │
├─────────────────────────────────────────────────────────────┤
│  internal/downloader (基础设施层 - 通用下载)                   │
│  - downloader.go: 单文件下载、流式下载、大小校验                 │
│  - file_writer.go: 原子写入、跳过未变化文件、并发锁管理           │
│  - version_manager.go: 版本备份（流式复制、保留最近 20 份）      │
├─────────────────────────────────────────────────────────────┤
│  internal/naming (命名服务)                                  │
│  - base.go / tweet_naming.go / user_naming.go / list_naming.go │
├─────────────────────────────────────────────────────────────┤
│  internal/scheduler (定时任务调度器)                          │
│  - scheduler.go: 调度执行与状态维护                            │
│  - types.go: ScheduleEntry / ScheduleStatus / ParsedSchedule│
├─────────────────────────────────────────────────────────────┤
│  internal/consolelog (控制台日志)                             │
│  - hub.go: 日志捕获和分发中心，支持 SSE 实时推送                  │
├─────────────────────────────────────────────────────────────┤
│  internal/utils (工具层)                                     │
│  - fs.go / http.go / algo.go / time_range.go / recovery.go  │
│  - user.go / win32.go (Windows) / stub.go (!Windows)        │
└─────────────────────────────────────────────────────────────┘
```

## 核心设计原则

| 原则 | 实现 |
| --- | --- |
| **Service 复用** | CLI 和 API 统一走 `DownloadService`，避免重复维护下载逻辑 |
| **入口与业务分离** | `internal/cli` / `internal/api` 只负责参数、HTTP、任务编排和响应 |
| **业务与下载器分离** | `internal/downloading` 负责"下载什么、按什么流程下载"，`internal/downloader` 负责"文件怎么下、怎么写" |
| **数据库集中管理** | SQLite schema、迁移、查询和实体同步集中在 `internal/database` |
| **任务异步化** | Server 模式通过 TaskManager、DownloadQueue、SSE 推进长任务 |
| **增量与重试** | 基于数据库和 `.data/errors.json` 做增量抓取与失败重试 |
| **跨入口一致性** | 用户下载、列表下载、关注下载、JSON 导入、Profile 下载都通过 service 层统一暴露 |

---

## Service 层架构

重构后的代码引入了 **Service 层**，将核心下载逻辑从 CLI 和 API 中抽象出来，实现代码复用和统一业务逻辑。

### 设计目标

| 目标 | 实现 |
|------|------|
| **统一业务逻辑** | CLI 和 API 共享同一套下载实现 |
| **简化 CLI 层** | CLI 只负责参数解析和调用 Service |
| **简化 API 层** | API 只负责 HTTP 路由和 SSE 推送 |
| **便于测试** | Service 接口易于 Mock 和单元测试 |

### DownloadService 接口

```go
type DownloadService interface {
    // 用户下载（单用户）
    UserDownload(ctx context.Context, taskID string, screenName string, opts DownloadOptions, reporter ProgressReporter) error
    
    // 列表下载（单列表）
    ListDownload(ctx context.Context, taskID string, listID uint64, opts DownloadOptions, reporter ProgressReporter) error
    
    // 关注列表下载
    FollowingDownload(ctx context.Context, taskID string, screenName string, opts DownloadOptions, reporter ProgressReporter) error
    
    // 批量下载（多用户/多列表/多关注）
    BatchDownload(ctx context.Context, taskID string, screenNames []string, listIDs []uint64, followingNames []string, opts DownloadOptions, reporter ProgressReporter) error
    
    // Profile 下载（指定用户）
    ProfileDownload(ctx context.Context, taskID string, screenNames []string, reporter ProgressReporter) error
    
    // 列表 Profile 下载
    ListProfileDownload(ctx context.Context, taskID string, listID uint64, reporter ProgressReporter) error
    
    // JSON 文件下载（第三方工具导出的推文 JSON）
    JsonFileDownload(ctx context.Context, taskID string, paths []string, noRetry bool, reporter ProgressReporter) error

    // LoongTweet 文件夹下载（TMD 生成的 .loongtweet）
    JsonFolderDownload(ctx context.Context, taskID string, paths []string, noRetry bool, reporter ProgressReporter) error

    // 标记已下载
    MarkDownloaded(ctx context.Context, taskID string, screenNames []string, listIDs []uint64, followingNames []string, markTime *string, reporter ProgressReporter) error

    // 重试所有历史失败推文（常规下载和 JSON 导入）
    RetryAllFailed(ctx context.Context, taskID string, reporter ProgressReporter) error

    // 清除所有失败推文记录
    ClearErrors() error
}
```

### 调用关系

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI 层    │────▶│  DownloadService│────▶│  downloading包   │
│  executor   │     │  (业务编排)      │     │  (具体实现)      │
└─────────────┘     └─────────────────┘     └─────────────────┘
                           ▲
┌─────────────┐            │
│   API 层    │────────────┘
│  handlers   │
└─────────────┘
```

## 开发指南

### 项目目录结构

```
tmd/
├── main.go                        # 应用入口（命令行解析、模式选择）
├── start-server.bat               # Windows Server 模式启动脚本
├── internal/
│   ├── api/                       # API Server 模块（web/download 单主题）
│   ├── cli/                       # CLI 命令模块
│   ├── config/                    # 配置管理
│   ├── service/                   # Service 层（核心业务编排）
│   ├── database/                  # 数据持久化层
│   ├── downloading/               # 核心下载逻辑
│   ├── downloader/                # 通用下载基础设施
│   ├── twitter/                   # Twitter API 客户端
│   ├── bot/                       # Bot 通知（telegram/discord/feishu/gotify/pushover/wechat）
│   ├── naming/                    # 命名服务
│   ├── entity/                    # 数据实体层
│   ├── path/                      # 路径管理
│   ├── scheduler/                 # 定时任务调度器
│   ├── consolelog/                # 控制台日志捕获与分发
│   ├── logging/                   # 日志基础设施（rotation / sanitize / lumberjack hook）
│   └── utils/                     # 工具函数
├── doc/                           # 详细文档
├── tools/                         # 工具脚本（tmd-db-migrate、convert_db_to_legacy.py、Tampermonkey脚本）
├── .github/workflows/             # CI/CD 配置
├── go.mod                         # Go 模块定义
├── go.sum                         # 依赖校验和
├── Dockerfile                     # Docker 镜像构建
├── docker-compose.yml             # Docker Compose 部署
├── readme.md                      # 用户手册
├── AGENTS.md                      # 协作与编码规则
├── LICENSE                        # GPL-3.0 许可证
└── .gitignore                     # Git 忽略规则
```

### Web 前端

`internal/api/web/download/` 是唯一前端，通过 `//go:embed web/*` 嵌入二进制，零构建、无前端依赖，共八个文件：

- `index.html`：外壳（顶栏、六个标签与六个 `section.view`）
- `app.js`：路由与视图注册、i18n、明暗主题、下载视图、SSE、认证
- `overview.js` / `data.js` / `schedules.js` / `logs.js` / `config.js`：各视图模块
- `styles.css`：CSS 变量 token（浅/深两套）与组件原语

路由是真实路径：`/` 总览、`/tasks` 下载、`/data` 数据、`/schedules` 计划、`/logs` 日志、`/system` 系统。`server.go` 把六条路径都交给 `handleWeb`，前端按 `location.pathname` 挂载视图。

模块通过 `window.TMD` 协作：`TMD.views.register` 注册视图，`TMD.on('tasks'|'schedules')` 订阅事件，`TMD.t` 取文案，`TMD.api` 发请求。静态文案写在 HTML 的 `data-i18n` 属性里，动态文案走 `I18N` 字典（zh-CN / en）。语言存于 `localStorage.tmd.lang`，主题取 `light|auto|dark` 存于 `localStorage.tmd.theme`，由 `<head>` 内联脚本在首帧前写入 `data-theme` / `data-resolved`。认证启用时（`api_key` 非空）登录换取 JWT，401 先尝试 refresh，SSE 用 `?token=`。

### Bot 命令层

四个可交互平台（Telegram / Discord / Feishu / WeChat）共用一层命令实现，平台包只保留网络与会话细节：

- `internal/bot/commands.go`：`ParseDownloadCommand` 解析 `/dl`（类型词 user/list/foll|following、列表 ID 校验、`key=value` 选项），并集中保存所有命令回复文案；`KindFromString` 与 `NewDownloadRequest` 供 Discord 的结构化选项复用。
- `internal/bot/tracker.go`：`TaskTracker` 按会话记录已提交任务，终态通知时 `Drain` 一次取出并清理，替代各平台原先各自维护的三层 map。
- `internal/api/bot_commands.go`：`NewBotDownloadTask` / `StartBotDownload` 负责按 kind 建任务并入队，`FormatTaskStatus` / `FormatTaskList` / `FormatCancelMessage` / `FormatTaskStats` 负责文本渲染（`markdown` 参数控制是否用反引号包裹 ID）。
- 平台包只做三件事：把平台事件转成命令字符串、调用共享函数、用平台 API 发回文本；`/stats` 等新命令因此只需在各平台分发处加一个 case。

### 运行测试

项目包含 **93 个测试文件**、1146 个测试函数，覆盖核心业务逻辑；HTTP 处理器契约测试集中在 `internal/api/contract_gaps_test.go`（日志、Cookie、配置、数据库子资源）：

```bash
# 运行所有测试（含竞态检测）
go test -race ./...

# 运行特定包的测试
go test -v ./internal/downloading/
go test -v ./internal/api/
go test -v ./internal/database/
go test -v ./internal/service/

# 运行单个测试函数
go test -v -run TestFunctionName ./internal/package/

# 生成覆盖率报告
go test -race -covermode atomic -coverprofile=covprofile ./...
go tool cover -html=covprofile -o coverage.html
```

### 静态检查

除测试外，三项静态检查必须零输出：

```bash
go vet ./...
staticcheck ./...            # go install honnef.co/go/tools/cmd/staticcheck@latest
deadcode -test ./...         # go install golang.org/x/tools/cmd/deadcode@latest
```

`go vet` 覆盖全部包；`staticcheck` 报告无条件临界区、无效格式等缺陷；`deadcode` 报告从 main 与测试都不可达的函数，出现输出即表示存在死代码。

### 代码风格

本项目遵循以下编码规范：

- **Go 标准**: 遵循 [Effective Go](https://go.dev/doc/effective_go) 和官方风格指南
- **格式化**: 使用 `gofmt` 格式化代码（IDE 自动格式化）
- **编码准则**: 参考 [AGENTS.md](../AGENTS.md) 中的协作与编码规则
- **设计原则**:
  - 简单优先：只写解决问题所需的最少代码
  - 外科手术式修改：只改必须改的内容
  - 接口隔离：小接口设计，便于 Mock 和测试
  - 分层解耦：清晰的层次结构，避免循环依赖

### 关键设计模式

| 模式 | 应用位置 | 说明 |
|------|---------|------|
| **依赖注入** | `service/deps.go` | 通过构造函数注入依赖，支持测试 Mock |
| **策略模式** | `downloader/downloader.go` | 小文件 Buffer / 大文件流式两种策略 |
| **观察者模式** | `api/sse_tasks.go` | SSE 推送任务状态更新 |
| **观察者模式** | `consolelog/hub.go` + `api/sse_logs.go` | SSE 推送实时日志流 |
| **工厂模式** | `naming/` | TweetNaming / UserNaming / ListNaming 工厂 |
| **工厂函数** | `database/connect.go` | 统一建库、迁移与校验入口（每次调用新建连接，非单例） |
| **调度器模式** | `scheduler/scheduler.go` | interval/daily 两种调度策略 |

### CI/CD 流程

项目配置了两个独立的 GitHub Actions 工作流：

```yaml
go.yml（Go Release）:
  触发条件:
    - 创建版本标签 (v*)；仅改 *.md 或 doc/ 的提交不触发

  执行步骤:
    1. verify：go test -race -count=1 ./... 与 go vet ./...（release-build 依赖 verify）
    2. 6 平台交叉构建 (Windows / Linux / macOS × amd64 / arm64)
    3. 生成 checksums.txt
    4. 自动创建 GitHub Release 并上传二进制

docker.yml（Docker Publish）:
  触发条件:
    - 创建版本标签 (v*)
    - workflow_dispatch（手动触发）

  执行步骤:
    1. 多平台镜像构建 (linux/amd64 + linux/arm64)
    2. 推送 GHCR (ghcr.io) + Docker Hub
```

go.yml 含 verify job（`go test -race`、`go vet`），release-build 依赖它通过；docker.yml 只构建并推送镜像。两个工作流均未接入 Coveralls。

### 独立工具

| 工具 | 位置 | 用途 |
|------|------|------|
| **tmd-db-migrate** | `tools/tmd-db-migrate.py` | 跨平台数据库路径迁移：下载目录从 Windows 迁移到 Linux 等场景时重写 `foo.db` 中的 `parent_dir` 路径 |
| **convert_db_to_legacy.py** | `tools/convert_db_to_legacy.py` | 将新格式数据库转换为旧格式的辅助脚本 |
