# 开发与运维文档索引

本目录是 TMD（tmdp）的**人类可读**文档集：设计说明、子系统规则、运维排错与工具用法。面向 AI 代理的、与源码交叉锚定的知识图谱在仓库根的 `lat.md/`（由 `lat check` 校验），两者应保持一致。

> 维护说明：
> 1. 新增或删除本目录文件时同步更新本索引。
> 2. **历史快照类文档必须在此显式标注**，避免被后续读者当成现状引用。
> 3. 本文档集统一使用**符号锚点**（`internal/api/server.go#buildHandler`、`internal/api/Server#GracefulShutdown`），不写 `文件:行号` —— 行号必然漂移，见 `doc/web1-code-conventions.md` 开头的约定。
> 4. 文档与代码冲突时**以代码为准**，并顺手修正文档。

## 按任务快速导航

| 我要… | 读 |
| ---- | ---- |
| 了解整体分层与模块边界 | [architecture.md](architecture.md)、[architecture_diagram.md](architecture_diagram.md) |
| 新增/修改一个下载操作 | [SERVICE_LAYER.md](SERVICE_LAYER.md)、[architecture.md](architecture.md)、`lat.md/download-pipeline.md` |
| 调用或对接 HTTP API | [API_DOCUMENTATION.md](API_DOCUMENTATION.md) |
| 搞懂登录、JWT、公开路径、401 行为 | [tmd-api-auth-layer.md](tmd-api-auth-layer.md) |
| 改实体目录/数据库一致性相关代码 | [entity-storage-lifecycle.md](entity-storage-lifecycle.md)、[foo.db 技术文档.md](foo.db%20技术文档.md) |
| 改配置项、环境变量、向导 | [config-system.md](config-system.md) |
| 改文件名/目录名/扩展名规则 | [naming-and-paths.md](naming-and-paths.md) |
| 写测试、跑 CI 门禁 | [testing.md](testing.md) |
| 改任一前端主题 | [frontend-architecture.md](frontend-architecture.md) + 对应主题的 code-conventions |
| 线上出问题的定位与恢复 | [troubleshooting.md](troubleshooting.md) |
| 用迁移/转换/探针脚本 | [tools.md](tools.md) |
| 解释 `-mark-downloaded` 行为 | [mark-downloaded详解.md](mark-downloaded详解.md) |
| 解释用户改名与目录/符号链接同步 | [用户名变更处理机制.md](用户名变更处理机制.md) |
| 看日志规范与脱敏 | [tmd-logging-implementation.md](tmd-logging-implementation.md) |
| 接入 Bot 平台 | [bot-integration.md](bot-integration.md) |
| 查询某个 API 端点如何实现（调用链细节） | [call_chain_analysis_report.md](call_chain_analysis_report.md) |
| 查找列表 ID / cookie 的获取方式 | [help.md](help.md) |

## 架构与设计

| 文档 | 内容 |
| ---- | ---- |
| [architecture.md](architecture.md) | 分层与模块边界、执行模式差异、目录树、Service 层接入、测试与 CI、独立工具 |
| [architecture_diagram.md](architecture_diagram.md) | 单页架构图与图例（组件关系一览） |
| [SERVICE_LAYER.md](SERVICE_LAYER.md) | `internal/service`：11 个操作、依赖注入、进度上报、编排模板、踩坑 |
| [call_chain_analysis_report.md](call_chain_analysis_report.md) | 端点 → 处理器 → 队列 → Service → downloading 的完整调用链、中间件顺序、边界情况检查 |

## 子系统规则

| 文档 | 内容 |
| ---- | ---- |
| [entity-storage-lifecycle.md](entity-storage-lifecycle.md) | 实体目录与数据库记录的一致性：Create/Rename/Remove、双层锁、删除日志与启动对账、跨平台尾点空格 |
| [config-system.md](config-system.md) | 配置字段、校验与归一化、加载优先级（conf.yaml / `TMD_*` / 向导）、运行期生效范围、端口分层 |
| [naming-and-paths.md](naming-and-paths.md) | 字节预算、两套清洗策略、统一扩展名规则、路径去重、原子写与版本备份、`StorePath` |
| [tmd-api-auth-layer.md](tmd-api-auth-layer.md) | API Key + JWT 双模式认证：中间件顺序、公开路径、令牌生命周期与续期窗口、限流、前端刷新链 |
| [tmd-logging-implementation.md](tmd-logging-implementation.md) | 日志栈：logrus/lumberjack/consolelog Hub、域前缀、脱敏入口、Web 日志 API 过滤器 |
| [bot-integration.md](bot-integration.md) | 六平台 Bot：接入方式、命令与选项、通知去重、启动条件、扩展新平台 |
| [mark-downloaded详解.md](mark-downloaded详解.md) | `-mark-downloaded` / `-mark-time`：三种时间语义、`latest_release_time` 的 UTC 归一、日志与错误处理 |
| [用户名变更处理机制.md](用户名变更处理机制.md) | 改名检测 → 目录改名（CAS）→ 符号链接同步 → 历史名表，以及边界情况 |

## 前端

| 文档 | 内容 |
| ---- | ---- |
| [frontend-architecture.md](frontend-architecture.md) | 三主题共同形态、embed 与 `TMD_DEV=1`、主题发现与切换、静态资源与 ETag、共享时间契约、SSE 客户端生命周期、前端安全与主题一致性约束 |
| [web1-code-conventions.md](web1-code-conventions.md) | web1（经典主题，默认）代码规范与陷阱 |
| [web2-code-conventions.md](web2-code-conventions.md) | web2（精简主题）代码规范与陷阱 |
| [web3-code-conventions.md](web3-code-conventions.md) | web3（深色玻璃拟态主题）代码规范、无障碍契约与响应式断点 |

## 数据与存储

| 文档 | 内容 |
| ---- | ---- |
| [foo.db 技术文档.md](foo.db%20技术文档.md) | SQLite schema 与索引、DSN 与连接池、两条迁移路径、实体表语义、时间戳约定、备份与常见问题 |
| [foo.db 跨平台迁移说明.md](foo.db%20跨平台迁移说明.md) | `tools/tmd-db-migrate.py`：存储根路径重写、dry-run 与写入语义、备份与冲突保护 |

## 运维与排错

| 文档 | 内容 |
| ---- | ---- |
| [troubleshooting.md](troubleshooting.md) | 症状 → 定位 → 处置：数据库打开失败与残留文件、实体目录对账、429/1015 诊断、失败分类、时间戳与时区、日志定位、关停语义、状态码速查 |
| [tools.md](tools.md) | `tools/` 全部工具：数据库迁移与格式转换、X API 探针、两套浏览器 E2E、Tampermonkey 脚本 |
| [testing.md](testing.md) | 测试规模与分布、内存数据库隔离、网络测试与数据隐私约定、断言质量要求、CI 门禁与前端 E2E 跑法 |
| [help.md](help.md) | 面向用户的指引：如何获取 Cookie、list_id、user_id、screen_name |

## 历史快照（勿当作现状引用）

以下文档记录**特定时间点**的状态，其结论不代表当前实现；正文按约定保留原样，仅以横幅或说明标注。

| 文档 | 快照内容 |
| ---- | ---- |
| [TMD 版本对比分析报告.md](TMD%20版本对比分析报告.md) | v2.4.4 与当时最新版的逐函数对比；正文含作者本机 `file://` 绝对路径，不可复现 |
| [api-response-observations.md](api-response-observations.md) | 2026-08-15 单次真实运行观测（429/1015、并发阈值样本），非规范 |
| [user-accessible-status-changelog.md](user-accessible-status-changelog.md) | v2.8.0 引入 `is_accessible` 字段时的实现记录（含顶部勘误：初版文档曾虚构一套不存在的机制） |

## 相关文件

| 位置 | 内容 |
| ---- | ---- |
| `lat.md/` | 机器可校验的知识图谱（架构、业务流程、不变量），用 `lat search` / `lat section` 检索，用 `lat check` 校验 |
| `AGENTS.md` | 仓库级工作约定（含 `lat.md/` 工作流与提交前检查清单） |
| `CHANGELOG.md` | 版本史（Keep a Changelog 格式）；`[Unreleased]` 段是当前开发重点 |
| `readme.md` | 面向使用者的主文档（安装、CLI 参数、API 速查、存储结构、日志、排错） |
