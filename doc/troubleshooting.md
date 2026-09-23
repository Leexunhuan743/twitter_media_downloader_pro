# 故障排除与运维手册

> 维护说明：本文档解决"东西坏了怎么定位、怎么恢复"，服务对象是**运维者与后续开发者**（对照 readme 的"故障排除进阶"，本文补足其没有的机制深度：启动 fail-closed 语义、暂存目录对账、冷却与限流判定、日志与关停语义）。每条事实均来自当前源码；推断处标注 `[INFERENCE]`。
>
> 规范摘要（行为契约，以 lat 校验为准）：`[[lat.md/database.md]]` 的 Entity Storage Lifecycle 与 Schema 一节、`[[lat.md/logging.md]]`、`[[lat.md/api-server.md]]`、`[[lat.md/twitter-api.md]]`、`[[lat.md/download-pipeline.md]]`、`[[lat.md/development.md]]` 的 What NOT to Do。本文只写操作与陷阱，不重复规范条文。

## 0. 速查表：症状 → 首查 → 处置

| 症状 | 首查位置 | 关键处置 |
|---|---|---|
| 启动即退出，`[db]` 报错 | `tmd2.log` 中 `[db] connect failed` | 见 §1 数据库 |
| 启动即退出，`[startup] login failed` | `tmd2.log` + `client.log` | Cookie/风控，见 §3 |
| 启动日志出现 `Reconciled staged entity directories` | `tmd2.log` `[startup]` 域 | 见 §2 实体目录 |
| 任务大量失败，日志全是 429/1015 | `tmd2.log` `[rate-limit]`/`[twitter]` 域 | 见 §3 限流 |
| 个别推文缺媒体，`[download] Skip non-retriable media` | `tmd2.log` `[download]` 域 | 403/404，见 §4 |
| 同一批推文反复重下 | `errors.json` + `foo.db` 时间戳 | 见 §5 时间戳 |
| 关停期所有写请求 503 | 任意请求日志 | 预期行为，见 §7 |
| API 返回 4xx/503 | 响应体 message + `[api]` 访问日志 | 见 §8 速查 |

---

## 1. 数据库：打不开 / 只读 / 磁盘满 / 残留物 / 备份

数据库入口只有一个：`main.go#initializeClients` → `internal/database/connect.go#Connect`，失败即整个进程启动失败（CLI 与 Server 模式相同）。所有失败都会带 `%q` 路径上下文并逐层包装，最外层日志是 `[db] connect failed path=...`（`main.go#initializeClients`）。

### 1.1 启动序列与失败点

```
Connect(path)
 ├─ 1. recoverInterruptedSQLiteReplacement(path)   ← 处理 .replacing/.migrating 残留（见 1.2）
 ├─ 2. 文件不存在? → 跳过迁移，直接新建
 ├─ 3. 文件存在 → migrateExistingDatabase(path)    ← 校验失败才走"备份→重建→原子替换"（见 1.3）
 ├─ 4. openSQLiteFile(path)                        ← 只读/路径无效/驱动打开失败在这里报
 ├─ 5. configureSQLiteConnection                   ← WAL、busy_timeout(30s)、单连接池
 ├─ 6. CreateTables + MigrateDatabase              ← 只读库/磁盘满/索引冲突在这里报
 ├─ 7. NormalizeLegacyTimestamps                   ← 失败仅告警，不阻塞（见 1.4）
 └─ 8. validateDatabase                            ← 缺表/缺列 → 启动失败（fail-closed）
```

连接参数（`internal/database/sqlite.go#addSQLiteQueryDefaults`）：`journal_mode(WAL)`、`busy_timeout(30000)`（锁等待 30 秒）、`_time_format=sqlite`；`configureSQLiteConnection` 限制 `MaxOpenConns(1)`。**单连接**意味着并发写是串行的——不要试图从外部连多个写进程。

### 1.2 `.replacing` / `.migrating` 残留物的语义

旧库无法被当前驱动/当前 schema 读取时，`migrateExistingDatabase` 会把库搬到中间名再换入新库（`internal/database/sqlite_migration.go#replaceSQLiteFiles`）：

| 文件 | 角色 |
|---|---|
| `foo.db` | 正式库（唯一被程序使用的路径） |
| `foo.db.replacing` | 被换名挪开的**旧库**（等待被删除） |
| `foo.db.migrating` | 迁移**目标**（尚未提交的新库，可能含未完成的数据拷贝） |

崩溃窗口只有两类残留，启动时 `recoverInterruptedSQLiteReplacement`（`internal/database/sqlite_migration.go`）这样判定：

- **`foo.db` 缺失 + `foo.db.replacing` 存在** → 上次进程在"已挪走旧库、未换入新库"之间死亡。恢复：把 `foo.db.replacing` 换名回 `foo.db`，删除未提交的 `.migrating`，打日志 `[db] Recovered original database after interrupted replacement path=...`。这是**安全恢复**：旧库完整可用。
- **`foo.db` 缺失 + 只有 `foo.db.migrating` 存在**（无 `.replacing`）→ **拒绝启动**，错误原文 `database main file is missing while uncommitted migration target ... remains; refusing to create a new database`。原因：`.migrating` 是未提交的拷贝，不能证明数据完整；而 SQLite 在文件缺失时会自动新建空库——如果放任，会得到一个**空库**，让所有用户/实体记录"凭空消失"。宁可启动失败，也不生成空库（fail-closed）。

人工处置：

```bash
# 场景 A：确认 .replacing 是你要的旧库（先看它是否可读）
sqlite3 .data/foo.db.replacing "PRAGMA integrity_check;"     # 期望 ok
# 停止 tmdp 后，把旧库挪回、清掉未提交目标，再启动
mv .data/foo.db.replacing .data/foo.db
rm -f .data/foo.db.migrating .data/foo.db.migrating-wal .data/foo.db.migrating-shm

# 场景 B（只有 .migrating）：先备份现场再决定，不要直接删
#   - 若 .migrating 能打开且你确认它是你要的数据 → 改名提交
#   - 否则从 .backup.* 恢复（见 1.3），把 .migrating 移走留证
```

`[db]` 域你会在日志里看到的行（均为 `internal/database` 或 `main.go#initializeClients` 产出）：
`[db] Connected path=...`、`[db] Recovered original database after interrupted replacement path=...`、`[db] Created database file path=...`（仅新建时，Debug 级）、`[db] Legacy timestamp normalization incomplete error=...`、`[db] connect failed path=...`。

### 1.3 备份 `.backup.<ts>`：什么时候生成、能否回滚

- **生成时机**：仅当 `migrateExistingDatabase` 判定"现有库无法被当前驱动/schema 直接使用"时，`backupSQLiteFiles`（`internal/database/sqlite_migration.go`）先生成 `foo.db.backup.<YYYYMMDD_HHMMSS>`（连同 `-wal`/`-shm` 一并拷贝，`0600`），再基于备份重建。
- **保留策略**：迁移成功后备份**保留**（"成功后保留作为最终安全网"，`removeBackup=false`）；迁移中途任何一步失败，备份被清理。
- **能否回滚**：能。备份含主文件 + `-wal` + `-shm`，是 SQLite 一致的三件套，回滚必须三个一起换回：

```bash
# 先停 tmdp（WAL 文件在使用中不可信地覆盖）
tmdp -server            # 先 Ctrl-C 关停，再执行下面命令
mv .data/foo.db .data/foo.db.broken
cp .data/foo.db.backup.20260923_101500 .data/foo.db
cp .data/foo.db.backup.20260923_101500-wal .data/foo.db-wal
cp .data/foo.db.backup.20260923_101500-shm .data/foo.db-shm
```

> 注意：正常的日常运行**不会**生成 `.backup.*`——它不是备份机制，只是迁移安全网。若你只是想要日常备份，复制时**停掉服务并连同 `-wal`/`-shm` 一起拷**（或在 Web UI 关停后拷贝）；只拷 `foo.db` 会丢 WAL 中尚未合并的提交。另外 `tools/tmd-db-migrate.py`（存储根目录迁移工具）也会自建备份并在输出打印 `backup=...`，那是另一条路径，别混淆。

### 1.4 schema 校验失败 vs 时间戳归一化告警

| 现象 | 代码点 | 行为 |
|---|---|---|
| 缺表/缺列 | `internal/database/sqlite_schema.go#validateDatabase`，对照 `requiredSchema`（users、user_previous_names、lsts、lst_entities、user_entities、user_links 六张表及列） | **启动失败**：`database at %q failed validation after initialization: table %q is missing / missing column %q`。注意 `entity_removal_journal` 不在 `requiredSchema` 内（`schema_consistency_test.go#TestRequiredSchemaCoversSchemaTables` 显式豁免），它只由 `CreateTables` 建表。 |
| 列名过旧但可读 | `MigrateDatabase`（`internal/database/schema.go`） | 就地补 `users.is_accessible`、`user_previous_names.uid→user_id`、`lsts.owner_uid→owner_user_id`；"列已存在/无此表"等幂等场景跳过，不报错。 |
| 旧驱动旧 schema（整个库打不开） | `migrateExistingDatabase` | 走备份→重建→原子替换（1.3）。 |
| `latest_release_time` 非 UTC | `NormalizeLegacyTimestamps`（`internal/database/timestamps.go`） | **仅告警**：`[db] Legacy timestamp normalization incomplete error=...`，不阻塞启动，下次启动重试（见 §5）。 |

改 schema 的硬规则（见 §10 禁止清单第 3 条）：**必须同时**写 `requiredSchema`、迁移步骤与测试，否则 `TestSchemaColumnsMatchRequiredSchema` / `TestRequiredSchemaCoversSchemaTables` 会红。

### 1.5 磁盘满与只读的表征

- **启动期**：只读库 / 磁盘满在 `CreateTables` 或 `openSQLiteFile` 处失败（`internal/database/schema.go#CreateTables` 注释明确列出"只读数据库、磁盘空间耗尽、索引冲突"为必须可控的启动错误）；`Connect` 关闭句柄后上抛，进程退出。表征是 `[db] connect failed path=...: create tables: ...`。
- **运行期**：媒体写入遇到 `ENOSPC` 时，下载会**整批取消**（`internal/downloading/tweet_download.go#tweetDownloader` 对 `syscall.ENOSPC` 调 `config.cancel(err)`；`internal/downloading/profile/downloader.go` 同类处理并给剩余任务标 `download cancelled: disk full`）。所以"下载突然整批全 Failed、错误全是 disk full"先查磁盘，而不是查账号。
- **WAL 累积**：`foo.db-wal` 持续增长但 `foo.db` 不变是正常现象（WAL 模式），正常关停会 checkpoint；异常杀进程后 WAL 仍在、下次启动仍可恢复。若你手动删了 `-wal`/`-shm` 而进程还活着，等于丢弃未合并提交——**永远不要在进程运行时动这三件套**。

---

## 2. 实体目录不一致：`.tmd-remove-*` 暂存目录

### 2.1 暂存目录是什么

删除实体目录不是直接 `RemoveAll`，而是**两阶段提交**（`internal/entity/storage.go#stageEntityDirectoryRemoval`）：

1. **先把** `原路径`、`暂存路径` 写入 `entity_removal_journal` 表；
2. **再**把实体目录换名为同父目录下的暂存名，形如 `.tmd-remove-<随机后缀>`；
3. 数据库删除成功后才真正删目录并删 journal。

**journal 先于改名是刻意设计**：因此任何由本程序创建的暂存目录必然已有 journal 行，"磁盘上出现暂存目录 = 一次实体删除在收尾窗口里被中断（进程被杀/崩溃/断电），或收尾已完成但还没到下次启动清理"。**`entity_removal_journal` 表里有行但目录已不存在** = 崩在"写 journal 之后、改名之前"，原目录未被触碰，启动对账会把这条陈旧 journal 行删掉。两者都由启动时 `entity.CleanupStagedDirectories`（`internal/entity/storage.go`，`main.go#initializeClients` 在连库后立即调用）对账收口。

启动对账扫描三类父目录：调用方传入的配置根（`pathHelper.Root`、`pathHelper.Users`）、journal 记录中的目录、`user_entities`/`lst_entities` 表里的每个 `parent_dir`。

### 2.2 `Reconciled staged entity directories restored=N removed=M` 的两种含义

该日志**只在 `Restored>0 || Removed>0` 时打印**（`main.go#initializeClients`）；一行都没有 = 本次启动没有需要收口的暂存目录（不代表没有问题，问题会走 2.4 的告警）。

| 字段 | 含义 | 触发条件 |
|---|---|---|
| `restored=N` | 有 N 个暂存目录被**改名还原**成正式实体目录 | 该实体的数据库记录**仍存在**（`user_entities`/`lst_entities` 有行）→ 说明删除并未提交，中断的删除被恢复。这是**好事**：媒体回来了。 |
| `removed=M` | 有 M 个暂存目录被**彻底删除** | 该实体的数据库记录**已不存在** → 删除已提交，暂存目录只是收尾没做完，可以安全 `RemoveAll`。 |

判定依据是"暂存目录 ↔ 活跃记录"配对，且**只有 journal 行能作为归属证据**：

- 有 journal：`journal.OriginalPath` 对应的活跃记录还在 → restore；记录没了 → remove；恢复目标已存在（或归一化变体已存在）→ 保留 + 告警。
- 无 journal：**一律保留 + 告警**（无论名字是否带旧式的 `v1-<hash>` 段）。没有 journal 就无从证明它属于哪条记录，更无从证明它已被提交删除。

### 2.3 哪些暂存目录被故意保留、为什么

原则：**无法证明是孤儿，就绝不递归删除**（一条 `RemoveAll` 可能毁掉整目录媒体）。以下情况全部**保留原样并计入告警**（`cleanupErr` 通过 `errors.Join` 汇总）：

| 保留情形 | 代码依据 | 人工判定依据 |
|---|---|---|
| **任何无 journal 的暂存目录**（`.tmd-remove-*`，包括旧版本留下的 `.tmd-remove-v1-<hash>-*`） | `retain unjournaled staged entity directory ...: no removal journal` | 没有 journal 行就没有归属证据。先看内容是不是媒体；用 sqlite3 查 `entity_removal_journal` 表确认无对应行，再对照 `user_entities`/`lst_entities` 判断是否孤儿，最后人工决定（可直接改名回原路径或自行删除）。 |
| 恢复目标已存在 | `active recovery target ... already exists` | 暂存里是旧媒体，目标里已有新内容；人工比较时间戳再合并。 |
| 暂存路径同时是活跃路径 / 被 journal 记录但**不是普通目录**（文件、符号链接） | `path is both active and journaled` / `path is not a regular directory` | 数据不一致，先备份再人工处理；对账绝不跟随符号链接（`TestCleanupStagedDirectoriesDoesNotFollowSymlinks` 锁定）。 |

### 2.4 `Staged entity directory cleanup incomplete` 怎么读

`main.go#initializeClients` 中对账返回非 nil 错误时打：

```
[startup] Staged entity directory cleanup incomplete error="..."
```

`error` 字段是**多条保留原因用 `; ` 拼接**（`errors.Join`），每条对应一个暂存目录。读法：逐条对照 2.3 的表——凡是 `retain`/`ambiguous`/`already exists` 开头的一律是"故意保留，需要人工处理"，不是数据损坏；对账本身已经尽力收口（restore/remove 都做了），不会因为保留而失败退出。**处理完一批后重启**，让对账重新跑；想验证行为，直接跑 §10 的 `TestCleanupStagedDirectories*` 测试组（`internal/entity/storage_internal_test.go` 有 23 个用例覆盖上述每一种分支）。

---

## 3. 429 / 1015 限流：读日志、判定冷却、用 xapi-probe 区分根因

### 3.1 `[rate-limit]` 与 `[twitter]` 两个域的分工

这两个域都来自 `internal/twitter/client.go`，但**含义不同**，排查时先分清：

| 域 | 记录什么 | 级别 | 典型行 |
|---|---|---|---|
| `[rate-limit]` | 速率限制**状态机**：端点剩余配额、何时恢复、选哪个客户端、全局冷却等待 | 多数 Debug；阻塞等待/无可用客户端时 Warn | `[rate-limit] Sleeping endpoint=... wake_at=... remaining=... limit=...`；`[rate-limit] Skipping cooling client endpoint=... account=...`；`[rate-limit] Selected additional client endpoint=... account=...`；`[rate-limit] Global cooldown wait until=...`；`[rate-limit] No available clients endpoint=... total=... errors=...` |
| `[twitter]` | **账号级**事件：冷却设定、账号不可用、全局冷却 | Warn | `[twitter] Account cooldown account=... until=... dur=...`；`[twitter] Account unavailable account=... error=...`；`[twitter] Global cooldown until=... dur=...` |

阅读顺序：`[twitter] Account cooldown`（谁被冷却）→ `[rate-limit]` 的 Debug（每个请求前怎么选号）→ 两者都没有但仍有 429 时，看 `client.log`（§6）里裸的 HTTP 状态与 `Retry-After` 头。

### 3.2 冷却 vs 全局冷却

- **账号冷却**：某客户端收到 429 后 `setClientCooldown(cli, parseRetryAfter(...))`；`Retry-After` 头有效就按它，否则默认 **60 秒**（`defaultClientCooldown`）。冷却中的账号在 `SelectClient`/`SelectClientMFQ` 里被跳过。
- **全局冷却**：仅当**所有附加账号都进入冷却**时才由 `armGlobalCooldownIfIdle` 设置（只在空闲时设一次，避免并发等待者反复顺延），`SelectClientMFQ` 每次选号前先 `waitGlobalCooldown`。
- **1015 例外**：resty 重试条件里，`error code: 1015`（Cloudflare 风控）**不自动重试**——"快速重试只会加重封锁，交给冷却熔断处理"（`client.go#LoginWithOptions` 的 retry 条件 3）。所以日志里 1015 之后往往跟着冷却/全局冷却日志；不要手动连环重试。

### 3.3 xapi-probe 决策树与命令

`tools/xapi-probe`（入口 `tools/xapi-probe/main.go#main`）专治"GraphQL 请求 429/1015 到底是谁的问题"。它复用 `conf.yaml` 的凭据与代理，比较两套请求头（app 风格 vs Chrome 风格），**绝不打印** `auth_token`/`ct0`/`Authorization`/`Cookie`/`Set-Cookie`。flag 均来自 `main()` 的 `flag.*Var`：

| flag | 类型 | 作用 |
|---|---|---|
| `-conf` | string | conf.yaml 路径（默认 `<app root>/conf.yaml`） |
| `-user` | string | 探测的 screen name（默认 `backdoorgf`） |
| `-uid` | string | 已知 user id；给了就跳过 UserByScreenName |
| `-list` | string | list id：拉真实成员并对不同用户做 UserMedia 突发 |
| `-delay` | duration | 探测间隔（默认 3s） |
| `-skip-media` | bool | 跳过 UserMedia 探测 |
| `-burst` | int | 对同一用户发 N 个并发 UserMedia（0=关闭） |
| `-accounts` | bool | 每个配置账号（主 + 附加）各发一次 UserMedia |
| `-save-dir` | string | 保存 API 响应体 JSON |
| `-stress` | int | 阶梯加压到 N 并发（需 `-list`；上下文放宽到 10 分钟） |

**决策树**（先单发、再对比、再压测）：

```bash
# 0) 基线：默认头 + 浏览器头各一发（单点、低并发）
go run ./tools/xapi-probe -user <name> -uid <uid>

# 1) 疑似代理出口：临时改 conf.yaml 的 proxy_url 再跑 0；或用另一出口直连
#    （probe 输出 URL 与 status；注意 probe 本身不打印凭据，日志才需要防泄）

# 2) 疑似账号状态：每个账号各一发（主号挂了 vs 附加号挂了一目了然）
go run ./tools/xapi-probe -user <name> -uid <uid> -accounts

# 3) 疑似突发压力：并发打同一用户，找阈值
go run ./tools/xapi-probe -user <name> -uid <uid> -burst 100

# 4) 疑似"单用户风控"：换真实列表的多个成员各打一发
go run ./tools/xapi-probe -user <name> -uid <uid> -list <listID> -burst 242

# 5) 阶梯加压：确认在多少并发下出现 429/1015（跨全部账号）
go run ./tools/xapi-probe -stress 543 -list <listID> -delay 2s

# 6) 保留原始响应体做离线分析
go run ./tools/xapi-probe -user <name> -uid <uid> -list <listID> -save-dir tools/xapi-probe/saved-api-json
```

判定（probe 输出 `Status`/`Retry-After`/`X-Rate-Limit-*`/`Cf-Ray`/`Server`/截断 body，`main.go#result.Print`）：

| 现象 | 结论 | 处置 |
|---|---|---|
| 两种头都 200 | 请求头/凭据/账号/出口都正常 | 问题在**突发压力** → 降并发（3.4） |
| 浏览器头 200、默认头 1015 | **请求头**（Cloudflare bot 判定） | 对照 `internal/twitter/client.go#SetClientAuth` 与实际浏览器头差异 |
| 全账号都 1015 | **代理出口** IP 被风控 | 换出口/清 IP 池；别反复打 |
| 主号 1015、附加号 200 | **账号状态**差异 | 换主 Cookie 或给主号降温 |
| 全账号 200、但 body 是错误 JSON 或新结构 | **API 变更**（GraphQL 端点/字段失效） | 对照 `tools/xapi-probe/main.go` 顶部的端点常量与 `client.go` 的请求 |
| `-burst`/`-stress` 到某并发才出现 | **突发压力**阈值 | 压到 3.4 建议值以内 |

### 3.4 并发参数建议阈值

来源：`internal/config/config.go#Validate` 的 `normalizeInt` 与 `internal/downloading/types.go#RuntimeOptions`（`NormalizeMaxDownloadRoutine*`/`NormalizeMaxUserFetchConcurrent*` 测试锁定）。

| 参数 | 默认 | 合法范围 | 说明 |
|---|---|---|---|
| `max_user_fetch_concurrent` | 3 | 1–35（`MinUserFetchConcurrent=1`、`MaxUserFetchConcurrent=35`） | UserMedia 抓取并发（ants.Pool 大小）。默认 3 已经很低；**先跑 xapi-probe 证明有余量再往上加**。 |
| `max_download_routine` | `min(50, GOMAXPROCS×10)` | ≤100（`MaxDownloadRoutine=100`） | 媒体落盘并发（N 个 goroutine）。瓶颈通常是磁盘/带宽而非 API，调高对 429 无帮助，反而放大 ENOSPC 批量取消的波及面。 |

经验（`[INFERENCE]`，源自上面的机制）：429/1015 时**优先降 `max_user_fetch_concurrent`（每次减半，最低回到 3）**，而不是动 `max_download_routine`；附加 Cookie 足够多（`additional_cookies.yaml`）是比降并发更有效的解（`SelectClientMFQ` 会分摊）。`-dbg` 模式退出时会打印各端点请求计数（`twitter.ReportRequestCount`），配合 `[rate-limit] Request count endpoint=... count=...` 评估实际 QPS。

---

## 4. 下载失败分类：403/404、errors.json、`-no-retry`

### 4.1 403/404 立即跳过、不进 errors.json

**机制**：`internal/downloader/downloader.go#IsNonRetriableStatusError` 只认 403/404（`utils.IsStatusCode`）。重试循环里遇到它**直接返回**（`TestDownloader_DownloadStream_404DoesNotRetry` 锁定）；在 `internal/downloading/tweet_download.go#downloadTweetMedia` 里，下载返回 403/404 时打 `[download] Skip non-retriable media tweet_id=... url=...`，并把该 URL 从 `tweet.Urls` **剔除**（`tweet.Urls` 最终只保留需要进重试链路的 URL），推文整体不算失败 → **不会**被 `collectFailedTweets` 收进 `errors.json`。

**为什么这样设计**：403/404 重试一万次结果不变，进了 errors.json 只会让每次运行都白重试一遍、污染失败记录（readme 故障排除也强调这条）。**影响**：

- 这类推文**不会出现在 Web 的"失败记录"面板**，`RetryAllFailed` 也重试不到它们——这是特性不是 bug。
- 想重新尝试：重新发起该用户/列表的下载（403 需先关注/`-auto-follow`；404 需确认用户名、账号是否仍存在）。
- 区分口径：日志 `[download] Skip non-retriable media`（Info）vs `[download] Failed media`/`Media reported failure`（Warn，可重试）。503/500/网络错走后者进 errors.json。

### 4.2 errors.json 与 json_errors.json 的结构

都在 `{rootPath}/.data/`（`internal/path/store.go#NewStorePath` 的 `ErrorsPath`/`JSONErrorsPath`）。

- **errors.json**（常规下载）：`TweetDumper`（`internal/downloading/dumper.go`）序列化为 `map[entityID][]Tweet`：

```json
{
  "12": [
    { "id": 1800000000000000000, "user_id": 1000000000000001, "created_at": "2026-09-23T04:00:00Z", "text": "...", "urls": ["https://pbs.twimg.com/..."], ... }
  ]
}
```

  `entityID` 是 `user_entities.id`（不是 user id）。写入是**一次性整文件覆写**（`saveDumper`，先 load-merge 后 save，`download_service.go#saveDumper` 由 `dumperMu` 保护，`TestDownloadServiceImpl_SaveDumper_RemoveViaSaveDumper` 验证 Remove 不会被 load-merge 加回来）。

- **json_errors.json**（`-jsonfile`/`-jsonfolder` 导入）：`JsonTweetDumper` 按**源路径**组织，`JsonDumpEntry{SourcePath, Type, Tweets, Dirs}`：

```json
{
  "/path/to/export.json": {
    "SourcePath": "/path/to/export.json",
    "Type": "file",
    "Tweets": [ { "id": 1800000000000000000, ... } ],
    "Dirs": { "1800000000000000000": "users/someone" }
  }
}
```

  与普通 dumper 相互独立、互不混写。

### 4.3 重试路径与 `-no-retry` 的用途

- **自动重试（同一任务内）**：任务跑完一轮后，`download_service.go#executeDownloadTemplate` 会 `RetryFailedTweets`（常规）+ 各 JSON 路径会 `RetryFailedJsonTweets`；成功后从 dumper `Remove`，失败的留下待下次。
- **手动重试**：`RetryAllFailed()` 先重试 `errors.json` 再重试 `json_errors.json`（`download_service.go#RetryAllFailed`，Web 面板"重试全部失败"）；`ClearErrors()` 两个文件一起清。
- **`-no-retry`（CLI）与 `no_retry`（API/调度/Bot）**：**只跳过"同一任务内"的失败重试这一遍**，`errors.json`/`json_errors.json` **仍然照常写入**（`download_service.go#JsonFileDownload` 注释：`noRetry=true 时跳过重试，失败项仍会持久化到 json_errors.json 供下次运行使用`；常规路径 `defer s.saveDumper(...)` 不受 NoRetry 影响）。用途：快速验证配置/排查单文件问题，不想让每次运行都拖着重试尾巴；失败项仍可后续用 `RetryAllFailed` 或下次运行处理。
- **`FromUpload` 例外**：上传的 JSON 任务重试会被拒（409，见 §8），因为上传目录在任务结束后已清理。

### 4.4 已知限制：无 `Content-Length` 时"流式"退化为整块进内存

媒体下载按文件大小选策略（`internal/downloader/downloader.go`）：先发一次 `HEAD` 拿 `Content-Length`，`> 10MB` 走流式、否则走 Buffer；而**回退路径**（HEAD 失败，例如 CDN 对 HEAD 返回 405；或响应是 chunked、长度为 -1）会直接走 `downloadBuffer`，它把整个响应体读进内存后才交给 `FileWriter`。

后果：这两种情形下 ≥10MB 的文件不享受流式的内存上限，**峰值内存 ≈ 单文件大小 × 并发数**。缓解手段按成本从低到高：降低 `max download routine`；确认代理/CDN 不屏蔽 HEAD 请求；若要根治需要把回退路径也改成流式（`SetDoNotParseResponse` + 原始 body 作为 Reader 交 `FileWriter`，并显式 `Close`），本仓库当前**未做**该改动。

---

## 5. 时间戳与重复下载：latest_release_time 的 UTC 契约

### 5.1 为什么强制 UTC（SQLite TEXT 字典序）

`latest_release_time` 存在 `user_entities` 表（`internal/database/schema.go`），类型是 `DATETIME`，modernc 驱动在 `_time_format=sqlite` 下**以 TEXT 存储并保留时区偏移**（`internal/database/timestamps.go#sqliteTimeLayout` = `2006-01-02 15:04:05.999999999-07:00`）。SQLite 对 TEXT 用 **BINARY 字典序**比较 MAX：同一时刻的 `2023-12-31 16:30:00+00:00` 与 `2024-01-01 00:30:00+08:00` 字典序不同，`MAX()` 可能取到更旧的那条 → `UpdateUserEntityTweetStat` 把基线**回退** → 已下载过的推文被判"未下载"而重下。

因此**所有写路径**必须过 `NormalizeTime`（`timestamps.go`）转 UTC（`user_entity.go#UpdateUserEntityTweetStat`/`SetUserEntityLatestReleaseTime` 都在写前 Normalize；API 侧 `db_handlers.go` 校验 RFC3339 后同样归一化）。存储形如 `2024-01-01 00:00:00+00:00`（整秒时省略小数段，`timestamps_test.go` 锁定）。

### 5.2 混入本地时区的后果

- 旧版本（未归一化）或**外部工具/手工写库**写入带 `+08:00` 等偏移的值 → 字典序 ≠ 时刻序 → 基线回退、重复下载。
- 启动时 `NormalizeLegacyTimestamps` 会把非 UTC 行改写成 UTC；但它**只告警不阻塞**（§1.4），且若写入方持续写回偏移值，会反复出现 `[db] Legacy timestamp normalization incomplete`。
- 从 Web 数据控制台编辑 `latest_release_time` 时，前端 `datetime-local` 会按**本地时区**转成 UTC RFC3339 提交（web2/web3 `toRFC3339`），后端再校验；不要直接往 YAML/库写本地墙钟字符串。

### 5.3 sqlite3 验证查询

```bash
# 在 conf.yaml 的 root_path 下（users 表无 latest_release_time 列，需 JOIN user_entities）
sqlite3 .data/foo.db \
  "SELECT u.screen_name, e.name, e.latest_release_time, e.media_count
   FROM users u LEFT JOIN user_entities e ON e.user_id = u.id
   ORDER BY e.latest_release_time DESC;"

# 找仍未归一化的行（非 +00:00 偏移）——排查重复下载的第一查
sqlite3 .data/foo.db \
  "SELECT id, user_id, CAST(latest_release_time AS TEXT) AS raw
   FROM user_entities
   WHERE latest_release_time IS NOT NULL
     AND CAST(latest_release_time AS TEXT) NOT LIKE '%+00:00';"

# 同一实体时间戳是否回退（基线倒挂 = 混入过本地时区）
sqlite3 .data/foo.db \
  "SELECT user_id, COUNT(*) AS rows_cnt,
          MAX(CAST(latest_release_time AS TEXT)) AS max_raw
   FROM user_entities GROUP BY user_id HAVING rows_cnt > 1;"

# 未收口的删除日志（配合 §2）
sqlite3 .data/foo.db \
  "SELECT staged_path, original_path, created_at
   FROM entity_removal_journal ORDER BY created_at;"
```

发现非 UTC 行时：停服 → 备份三件套 → 用 `NormalizeLegacyTimestamps` 的语义手工归一（或直接重启让启动对账改写，它幂等、只改非 UTC 行，`internal/database/test/timestamps_test.go#TestNormalizeLegacyTimestamps`）。

---

## 6. 日志定位：两个文件、轮转、域前缀、脱敏、Web 过滤

### 6.1 tmd2.log 与 client.log 的分工与轮转

两个文件都在应用根目录（`main.go#run` 里 `appRootPath` 下，默认 `%APPDATA%\.tmd2\`），都由 `logging.NewRotatingWriter`（`internal/logging/rotation.go`）创建，**共用同一套轮转参数**：单文件 2MB、保留 2 份、14 天、gzip 压缩（`TestNewRotatingWriterContract` 锁定）。

| 文件 | 内容 | 开关 |
|---|---|---|
| `tmd2.log` | 应用主日志：`[domain]` 前缀的 logrus 行 + HTTP 访问日志（`[api]`）+ panic 恢复（`[recovery]`）。经 `LumberjackHook` 写入，写前 `SanitizeLogText` | 默认 Info 级；`-dbg` 升为 Debug（`main.go#initLogger`） |
| `client.log` | resty HTTP 客户端**每次请求/响应**全量：方法、URL、状态码、耗时、headers、body。经 `cli.SetClientLogger`（`internal/cli/executor.go`）恒为 Debug 级，与 `-dbg` 无关 | 总是记录；body 单块 >256KB 截断（`SetDebugBodyLimit(256<<10)`） |

轮转产物 `[INFERENCE]`（lumberjack 库默认命名）：`tmd2-<时间戳>.log` 与 `.gz` 备份、`client-<时间戳>.log(.gz)`；`-dbg` 只影响 `tmd2.log` 的详细度，`client.log` 一直全量——排查"某个请求到底发出去没有、返回什么"，看 `client.log` 最快。

### 6.2 域前缀表（已确认存在的域）

日志域来自 `lat.md/development.md` 的 Logging Conventions 白名单；下表标注了**我从当前源码逐处确认过的调用点（下界计数，按字面量 `[domain]` 统计，非测试文件）**，新增日志必须从这张表里选，不要自造新域：

| 域 | 下界 | 含义（排查时怎么看） | 示例代码点 |
|---|---|---|---|
| `[download]` | 134 | 下载主流程：批量开始、每条媒体成败、标记下载、Dumper 读写 | `internal/downloading/tweet_download.go`、`mark_downloaded.go` |
| `[batch]` | 49 | 多目标批处理（users/lists/following 混排） | `internal/downloading/batch_any.go` |
| `[scheduler]` | 43 | 定时调度：触发、重载、generation | `internal/api/scheduler_download.go` |
| `[twitter]` | 25 | 账号级事件：登录、冷却、账号不可用 | `internal/twitter/client.go`、`batch_login.go` |
| `[config]` | 21 | 配置加载/校验/写入 | `internal/api/config_handlers.go`、`main.go` |
| `[cli]` | 21 | CLI 任务/模式 | `internal/cli/executor.go` |
| `[db]` | 19 | 数据库连接/迁移/校验（§1） | `internal/database/*`、`main.go` |
| `[profile]` | 19 | 资料（头像/横幅）下载 | `internal/downloading/profile/downloader.go` |
| `[server]` | 18 | Server 生命周期、关停各阶段（§7） | `internal/api/server.go` |
| `[rate-limit]` | 18 | 速率限制状态机（§3） | `internal/twitter/client.go` |
| `[startup]` | 17 | 启动各阶段：配置、登录、目录对账 | `main.go` |
| `[auth]` | 16 | 认证：登录/刷新/JWT 判定 | `internal/api/auth_jwt.go`、`middleware.go` |
| `[cookies]` | 14 | Cookie 管理 | `internal/api/cookie_handlers.go` |
| `[task]`/`[tasks]` | 10/5 | 任务管理器/入队 | `internal/api/task_log.go`、`download_handlers.go` |
| `[sse]` | 8 | SSE 事件流（任务/日志） | `internal/api/event_bus.go`、`sse_logs.go` |
| `[schedules]` | 8 | 调度配置 CRUD | `internal/api/scheduler_handlers.go` |
| `[bot-*]` | ~29 | 各 bot 平台（`[bot-telegram]` 等） | `internal/bot/*/bot.go` |
| `[download-queue]` | 6 | 下载队列生命周期 | `internal/api/download_queue.go` |
| `[jsonfolder]`/`[jsonfile]` | 6/4 | JSON 导入下载 | `internal/downloading/json_folder_download.go`、`json_file_download.go` |
| `[upload]` | 3 | 上传处理（§8 的 413/400 源头） | `internal/api/download_handlers.go` |
| `[api]` | 3 | HTTP 访问日志 + 请求体解析 | `internal/api/middleware.go`、`resource_handler.go` |
| `[downloader]` | 3 | 媒体下载器重试 | `internal/downloader/downloader.go` |
| `[consolelog]` | 2 | stdout/stderr 捕获 | `internal/consolelog/hub.go` |
| `[listener]` | 1 | 信号捕获（Ctrl-C 等） | `main.go` |
| `[logs]` | 1 | 日志导出 API | `internal/api/log_handlers.go` |
| `[web]` | 1 | 前端主题/静态服务 | `internal/api/handlers.go` |
| `[recovery]` | 1 | panic 恢复（常伴随"进程没崩但行为异常"） | `internal/utils/recovery.go` |

> 自行复核方法：`grep` 各文件里以 `log.<Level>f("[<域>` 开头的字面量即可；不要信 `[string]`/`[int]`/`[key]` 这类**字段名**（它们是 `%q` 的 key，不是域）。

### 6.3 ANSI 与脱敏对可读性的影响

- **终端彩色**：`main.go#configureTerminalColors` 默认 `ForceColors`，设了 `NO_COLOR` 环境变量则纯文本。
- **文件里永远是干净的**：`LumberjackHook.Fire` 和 `consolelog.Hub.Add` 都会先过 `logging.SanitizeLogText`（`internal/logging/sanitize.go`）——剥掉 ANSI/CSI/OSC 转义、掩码凭据、清理控制字符。**所以你从 `tmd2.log`/`client.log`/Web 日志页复制出来的内容天然无颜色码**；如果你在别处看到 ANSI 码，那一定不是这两个文件（比如直接 `go run` 的终端输出）。
- **脱敏口径**（`sanitize.go`）：URL 的 userinfo/query/fragment 敏感值、Telegram bot token、`Authorization` 头、常见凭据字段都换成**稳定短指纹**（`MaskSecret`），不是删除——便于对账又不泄密。URL 经 `SanitizeURL`/`RequestTarget`（访问日志）脱敏。
- 单行截断：Hub 存的每行上限 16KB（超出加 ` [truncated]` 后缀，`internal/consolelog/hub.go#truncateStoredLine`），默认只留最近 5000 行（`DefaultLimit`）；`tmd2.log` 文件本身不受此限。

### 6.4 Web 日志 API 的 level / q / domain 过滤与统计语义

端点与参数（`internal/api/log_handlers.go#handleGetLogs`）：

| 参数 | 语义 |
|---|---|
| `level` | `debug`/`info`/`warn`/`error`/`all`。**`error` 同时匹配 `ERRO[` 与 `FATA[` 前缀**（`matchLogLevel`，`TestMatchLogLevelTreatsFatalAsErrorFilterInput` 锁定） |
| `q` | 大小写不敏感子串搜索（对整行） |
| `domain` | 匹配 `[域]` 前缀（`matchLogDomain`）；传 `all` 或空 = 不过滤 |
| `start_time`/`end_time` | RFC3339 / `2006-01-02T15:04:05` / `2006-01-02`，按行内时间戳过滤 |
| `page`/`page_size` | 默认 100、上限 200（`defaultLogsPageSize`/`maxLogsPageSize`），逆序（最新在前） |

- **统计**：`GET /api/v1/logs/stats` 把 fatal **计入 error**（`handleLogStats`）；无级别前缀的行默认计入 info。
- **SSE**：`GET /api/v1/logs/stream?level=...` 只接受 `debug/info/warn/error/all`，传 `fatal` 直接 400（`isValidLogLevel`）；GET 端不做这个校验（`matchLogLevel` 能认 `fatal`）。
- **导出**：`GET /api/v1/logs/export` 导出的是**当前 `tmd2.log` 文件**（不是 Hub 的 5000 行快照），文件名 `tmd2-<时间戳>.log`。
- 排查时限流/认证：`[auth] Rate limit exceeded ip=...` 在 `auth_jwt.go`，登录/刷新端点本身也限流（429），别把 Web 登录限流和 Twitter 429 混淆。

---

## 7. 关停与僵尸进程

### 7.1 45 秒总截止与"空闲立即关停"

入口：`internal/api/server.go#GracefulShutdown`（触发源：进程信号、`POST /api/v1/server/shutdown`、`defer` 兜底）。语义：

- **单一共享截止** `defaultShutdownDrainTimeout = 45 * time.Second`：关停开始时记一个 deadline，所有阶段（active mutations → download queue → scheduler → bot startup/stop → HTTP server）共用这一个截止，**不是每阶段各 45 秒串行累加**（`TestGracefulShutdownSharesSingleDeadlineAcrossPhases` 锁定：两阶段各阻塞 >45s，总耗时 ≈45s 而非 ≈90s）。任一阶段超时打 `[server] Shutdown phase timed out phase=...`，然后 `httpServer.Close()` 强关。
- **空闲立即关停**：没有任何 mutation、队列、scheduler、bot、HTTP 时，`GracefulShutdown` 毫秒级返回（`TestGracefulShutdownIdleServerReturnsImmediately` 锁定：不得引入固定 sleep）。所以"关停很快/很慢"取决于当时有多少在途任务。

**僵尸进程排查**：关停只等已 admission 的工作；`WaitForShutdown` 由 `runServer` 在 `http.ErrServerClosed` 后调用，等 `shutdownDone`。若看到进程不退：查 `tmd2.log` 里 `[server] Graceful shutdown started` 之后是否出现 `Shutdown phase timed out`；`client.log` 是否有卡死的 resty 请求；下载队列对已取消任务的宽限 `downloadCancelGrace = 10 * time.Second`（`internal/api/download_queue.go`），`TestServer_GracefulShutdownWaitsForDetachedTaskExit` 覆盖 detached 任务的等待。OS 层强杀是最后手段（会留下 §1.2 的 `.replacing`/§2 的暂存目录，下次启动对账会收口，但**已提交到 WAL 的数据不丢**）。

### 7.2 关停期写请求返回 503 是预期行为

中间件栈（`internal/api/server.go#buildHandler`）：

```
securityHeaders → logging → CORS → shutdownMutationMiddleware → auth → mux
```

`shutdownMutationMiddleware` 在**认证外层**：一旦 `shuttingDown`，对 POST/PUT/PATCH/DELETE 直接写 `503 "Server is shutting down"`（`TestShutdownMutationMiddleware`）。**因此关停窗口里所有写请求 503 是设计行为**——即使带合法 token 也一样，因为闸门在认证之前。读请求（GET）不受闸门限制，但 HTTP server 的 `Shutdown` 会排空它们。

### 7.3 任务被拒 → Failed 而非假"已排队"

`ErrQueueClosed`（`internal/api/download_queue.go`）的注释明确：关停 TOCTOU 防护——**调用方必须把被拒绝的任务转为终态，而不是让 HTTP/Bot/Scheduler 收到"已排队"但永不执行的假成功**。落地：

- `enqueueTask`/`EnqueueTask`（`internal/api/download_handlers.go`）在队列关闭时 `taskManager.SetTaskError(task.ID, err)` → 任务终态为 **Failed**，日志 `[tasks] Enqueue rejected task_id=... type=... error=...`，HTTP 回 **503 "Task rejected during shutdown"**（上传变体回 503 且清理上传目录）。
- 测试锚点：`TestDownloadQueueEnqueueAfterCloseReturnsError`、`TestBuildAndEnqueueTaskWrites503WhenQueueClosed`、`TestBuildAndEnqueueTaskMarksMapperFailureFailed`。
- 用户侧含义：关停窗口提交的任务**不会**悄悄消失或永久 Queued，你在 Web 任务面板会看到它变 Failed（可重试的前提是任务不在 Failed/Cancelled 之外的状态，见 §8 的 409）。

---

## 8. API 错误语义速查

| 状态码 | 触发条件（代码依据） | 用户侧处置 |
|---|---|---|
| **401** | 认证失败：`conf.api_key` 非空时缺 token / token 无效 / JWT 过期。`X-Token-Type: expired`（签名有效已过期→前端应刷新）或 `invalid`（应重新登录）（`internal/api/middleware.go#authMiddleware`、`auth_jwt.go`）。登录/刷新端点密钥错误也回 401。 | 刷新/重新登录；`expired` 是正常的会话续期流程，`invalid` 才是凭据真错。 |
| **403** | **API 层没有 403**（全仓 `internal/api` 无 `StatusForbidden`）。媒体下载层的 403（受保护用户未关注）见 §4.1。 | 关注/`-auto-follow` 后重下。 |
| **404** | 任务不存在（`download_handlers.go`）、实体/用户/列表不存在（`db_handlers.go#writeEntityMutationError` 的 `ErrNotFound`）、调度不存在/配置文件缺失（`scheduler_handlers.go`）、静态资源不存在。 | 核对 ID/路径；实体被删过则重建。 |
| **409** | 两类来源：**① 实体/数据冲突**——目标目录已被另一实体占用（`ErrPathConflict`）、并发更新（`ErrConcurrentUpdate`）、统计已提交但改名被拒（`db_handlers.go#writeEntityMutationErrorWithDetail`）；**② 任务/调度状态冲突**——cancel 非 queued/running、delete 非终态、retry 非 failed/cancelled、重试上传来源任务（文件已清理）、调度已禁用/正在触发（`download_handlers.go`、`scheduler_handlers.go`）。 | ① 改目标名或等并发写完成再重试（409 语义是幂等可重试）；② 先查看任务/调度当前状态。 |
| **413** | 请求体超限：普通 JSON > **1MiB**（`defaultJSONBodyLimit`，`decodeBody`/`limitJSONBody`，`resource_handler.go`）；上传**整体** > **1GiB**（`maxUploadRequestSize`）。YAML/批量 raw 内容上限 16MiB（`rawContentBodyLimit`）。 | 缩小请求体。**注意陷阱**：单个上传文件 >400MiB 回的是 **400 "Invalid upload"** 而不是 413（`validateUploadFile` + `maxUploadFileSize`，`download_handlers.go`）。 |
| **503** | 三类来源：**① 关停写闸门** `Server is shutting down`（§7.2）；**② 队列关闭** `Task rejected during shutdown`（§7.3）；**③ 健康检查数据库不可达** `Database unavailable`（`server.go#handleHealth` 的 `db.Ping()` 失败）。 | ①/② 等关停结束重试；③ 查数据库文件与磁盘（§1）。 |
| **429** | 两类来源：**① Twitter GraphQL 429/1015**（见 §3）；**② Web 登录/刷新端点限流** `[auth] Rate limit exceeded`（`auth_jwt.go`）。 | ① 降并发/加 Cookie/换出口；② 稍等再登。 |

> 所有 API 错误都遵循 `lat.md/development.md` 的错误响应模式：`error` 字段是用户安全文案，原始错误只进服务端日志（`writeErrorDetail` 也只把 detail 拼进用户文案，不带原始错误）。

---

## 9. 禁止 / 必须 清单

针对本文档覆盖的子系统（数据库 / 实体目录 / 限流 / 下载失败 / 时间戳 / 日志 / 关停 / API），从代码约束与 `lat.md/development.md` 的 What NOT to Do 派生的硬规则：

**禁止**

1. **禁止在进程运行时动 `foo.db` 三件套**（`-wal`/`-shm` 或主文件）：单连接 + WAL 下会丢未合并提交（§1.5）。
2. **禁止直接把 `foo.db.migrating` 当正式库用，或看到 `foo.db` 缺失就"让它重新生成"**：fail-closed 是特性，生成空库 = 记录全丢（§1.2）。
3. **禁止只改 schema 不迁移不测试**：新增表/列必须同步 `requiredSchema` + 幂等迁移步骤 + 测试，否则 `TestSchemaColumnsMatchRequiredSchema`/`TestRequiredSchemaCoversSchemaTables` 红（§1.4）。
4. **禁止把 403/404 媒体失败塞进重试队列/errors.json**：`IsNonRetriableStatusError` 只认 403/404 是有意设计（§4.1，`lat.md/development.md` What NOT to Do 第 4 条）。
5. **禁止手动 `RemoveAll` 掉 `.tmd-remove-*` 暂存目录**：先核对 journal 表与活跃记录（§2.3）；"无法证明孤儿就不删"是对账的原则，手工操作更该遵守。
6. **禁止给日志造新域、或把 `%q` 的字段名当成域**：域必须取自 §6.2 白名单，且行首必须大写、`Errorf`/`Warnf`/`Infof`/`Debugf` 分级（`lat.md/development.md` Logging Conventions）。
7. **禁止手写正则脱敏**：统一走 `logging.SanitizeLogText`/`SanitizeURL`/`SanitizeHeaders`/`MaskSecret`（`internal/logging/sanitize.go`，`lat.md/development.md` 与 `tmd-logging-implementation.md` 都强调）。
8. **禁止把本地时区的墙钟写进 `latest_release_time`**：所有写路径必须过 `NormalizeTime`（§5）。
9. **禁止把关停期的"已排队"当成功回给客户端**：被 `ErrQueueClosed` 拒绝的任务必须转 Failed（§7.3）。
10. **禁止向 API 错误响应的 `error` 字段拼原始 `err.Error()`**：用户安全文案只进响应，原始错误进服务端日志（§8，`lat.md/development.md` Error Response Pattern）。

**必须**

1. **改任何与启动相关的失败路径时**，先确认它是"fail-closed"还是"仅告警"，并在文档/注释里写明（对比：`validateDatabase` 失败=启动失败，`NormalizeLegacyTimestamps` 失败=仅告警）。
2. **写并发/限流相关代码时**，区分 `[rate-limit]`（状态机）与 `[twitter]`（账号事件）两个域，并遵守"1015 不自动重试"的例外（§3.1/3.2）。
3. **验证改动用 §10 的单测锚点**而不是整仓 `go build` 后才看；改文档/只读内容跑 `lat check` 确认 `[[...]]` 引用可解析。
4. **日志里凡出现凭据/URL/头**，一律先过 sanitize 入口（`LumberjackHook`/`Hub.Add`/`SetClientLogger` 三处是最终闸门，别绕过）。
5. **处理暂存目录保留告警后要重启**让对账重跑，并核对 `restored`/`removed` 计数（§2.4）。

---

## 10. 验证命令汇总

命令均来自仓库现状（`go.mod` 的 Go 版本、`.github/workflows/go.yml` 的 `go test -race -count=1 ./...` + `go vet ./...` 门禁、各包真实测试函数名）。

**数据库 / 迁移 / 时间戳**（`internal/database` 与 `internal/database/test` 两个包）：

```bash
go test ./internal/database/ -run 'TestRecoverInterruptedSQLiteReplacement|TestReplaceSQLiteFiles' -count=1
go test ./internal/database/test/ -run 'TestConnect_RecoversOriginalAfterInterruptedReplacement|TestConnect_RefusesBlankDatabaseAfterStrandedMigration' -count=1
go test ./internal/database/test/ -run 'TestConnect_RebuildsLegacySchema|TestConnect_WALMode' -count=1
go test ./internal/database/test/ -run 'TestNormalizeLegacyTimestamps|TestSetUserEntityLatestReleaseTimeStoresUTC' -count=1
go test ./internal/database/ -run 'TestSchemaColumnsMatchRequiredSchema|TestRequiredSchemaCoversSchemaTables' -count=1
```

**实体目录对账**（`internal/entity`，23 个对账用例）：

```bash
go test ./internal/entity/ -run 'TestCleanupStagedDirectories' -count=1
go test ./internal/entity/ -run 'TestValidateNameRejectsWindowsIncompatibleNames|TestStagedDirectoryHash' -count=1
```

**限流 / 冷却**（`internal/twitter`）：

```bash
go test ./internal/twitter/ -run 'TestSelectClientMFQ|TestAllAdditionalInCooldown|TestArmGlobalCooldownIfIdle|TestParseRetryAfter' -count=1
```

**下载失败 / 不可重试 / Dumper**（`internal/downloader`、`internal/downloading`）：

```bash
go test ./internal/downloader/ -run 'TestDownloader_DownloadStream_404DoesNotRetry|TestDownloader_Download_RetrySuccess' -count=1
go test ./internal/downloading/ -run 'TestDownloadTweetMedia_SkipsNonRetriableStatus|TestBatchDownloadTweet_404DoesNotReturnFailedTweet' -count=1
go test ./internal/downloading/ -run 'TestTweetDumper|TestJsonDumper' -count=1
go test ./internal/downloading/ -run 'TestMarkUsersAsDownloaded|TestParseMarkTimeValue' -count=1
```

**关停 / 队列 / 中间件**（`internal/api`）：

```bash
go test ./internal/api/ -run 'TestGracefulShutdown|TestShutdownMutationMiddleware|TestBuildHandlerAppliesShutdownGateBeforeAuthentication' -count=1
go test ./internal/api/ -run 'TestDownloadQueueEnqueueAfterCloseReturnsError|TestBuildAndEnqueueTaskWrites503WhenQueueClosed|TestBuildAndEnqueueTaskMarksMapperFailureFailed' -count=1
```

**日志 / 脱敏 / 轮转**（`internal/logging`、`internal/api`）：

```bash
go test ./internal/logging/ -run 'TestStripANSI|TestSanitizeLogText|TestMaskSecret|TestNewRotatingWriterContract' -count=1
go test ./internal/api/ -run 'TestMatchLogLevel|TestMatchLogDomain|TestFilterLogLinesReverseAppliesDomain|TestParseLogTimeSupportsCurrentTextFormatter' -count=1
```

**请求体上限 / API 语义**（`internal/api`）：

```bash
go test ./internal/api/ -run 'TestDecodeBodyRejectsOversizedJSON|TestDecodeBodyAcceptsNormalJSON' -count=1
go test ./internal/api/ -run 'TestAuthMiddleware|TestAuthLogin|TestRefreshRejectsAncientExpiredToken' -count=1
```

**整仓门禁**（与 CI `.github/workflows/go.yml` 一致）：

```bash
go test -race -count=1 ./...
go vet ./...
go build -o tmdp.exe .
npx --yes lat.md@0.12.2 check   # 文档/知识图谱校验；改了 doc/ 或 lat.md/ 后必跑
```

**运行时独立验证**：

```bash
# 健康检查（Server 模式；DB 不可达时这里返回 503 而非 200）
curl -s http://127.0.0.1:25556/api/v1/health

# xapi-probe（§3.3，区分 429/1015 根因）
go run ./tools/xapi-probe -user <name> -uid <uid> -accounts
go run ./tools/xapi-probe -user <name> -uid <uid> -burst 100

# sqlite3 只读巡检（§5.3；千万别在运行中加 -wal 之外的写操作）
sqlite3 .data/foo.db "PRAGMA integrity_check;"
```

---

## 11. 改这里会波及什么

| 改动点 | 波及面（调用方 / 不变量） |
|---|---|
| `internal/database/connect.go#Connect` | 启动唯一入口：`main.go#initializeClients`（CLI 与 Server 共用）。改失败语义 = 全局启动行为。必须同时核对 `validateDatabase`、`CreateTables`、`MigrateDatabase`、`NormalizeLegacyTimestamps` 四段的责任边界（哪个 fail-closed、哪个仅告警）。 |
| `internal/database/sqlite_migration.go#replaceSQLiteFiles` / `recoverInterruptedSQLiteReplacement` | 迁移原子替换与崩溃恢复的唯一实现；配套测试 `TestReplaceSQLiteFiles_*`、`TestRecoverInterruptedSQLiteReplacement_*`（`internal/database/`）与 `TestConnect_*`（`internal/database/test/`）锁定。改这里会影响"备份→重建→换名"整条链，波及 `migrateExistingDatabase` 与 `.backup.*` 生命周期。 |
| `internal/database/sqlite_schema.go#validateDatabase` + `requiredSchema` | 新增表/列必须同步该映射，否则：校验漏检（危险）或 `TestSchemaColumnsMatchRequiredSchema`/`TestRequiredSchemaCoversSchemaTables` 红。`entity_removal_journal` 是显式豁免项，别误加。 |
| `internal/database/timestamps.go#NormalizeTime`/`NormalizeLegacyTimestamps` | 所有写 `latest_release_time` 的路径必须过 `NormalizeTime`：`user_entity.go#UpdateUserEntityTweetStat`、`#SetUserEntityLatestReleaseTime`、`mark_downloaded.go#MarkUsersAsDownloaded`、API `db_handlers.go` 的 entity 更新。漏一处 = 该路径写回本地时区 → 基线回退重复下载。 |
| `internal/entity/storage.go#CleanupStagedDirectories` 及 `stageEntityDirectoryRemoval`/`commit`/`rollback` | 启动对账 + 删除两阶段提交的同一文件。改 rename/remove 判定 = 影响所有实体删除（Web 数据控制台删除、改名、`DelUser` 级联）。不变量：无 journal 的版本化暂存只有**唯一**活跃候选才 restore；`RemoveAll` 前必须能证明孤儿。23 个 `TestCleanupStagedDirectories*` 是回归网。 |
| `internal/twitter/client.go`（`SelectClient`/`SelectClientMFQ`/`setClientCooldown`/`armGlobalCooldownIfIdle`/retry 条件） | 全链路所有 GraphQL 请求的选号与冷却；`downloading`（batch/profile/json）与 `service` 全部消费。改 1015 重试例外或全局冷却触发条件 = 直接影响 429 表现与账号被封风险。`internal/twitter/cooldown_test.go` 锁定。 |
| `internal/downloader/downloader.go#IsNonRetriableStatusError` | `downloader` 与 `downloading/tweet_download.go` 共用（注释明说"避免双实现分叉"）。改判定集合 = 同时改变"是否进 errors.json"与"是否自动重试"，违反 What NOT to Do 第 4 条。 |
| `internal/downloading/dumper.go`（`TweetDumper`/`JsonTweetDumper`）与 `download_service.go#saveDumper` | errors.json/json_errors.json 的读写与互斥。改持久化格式 = Web 失败面板、`RetryAllFailed`、`ClearErrors` 三方契约一起变；`FromUpload` 任务的"不可重试"判定也依赖 dumper 语义。 |
| `internal/api/server.go#GracefulShutdown` + `shutdownMutationMiddleware` | 关停阶段顺序（mutations→queue→scheduler→bot→HTTP）、45s 共享截止、503 写闸门。改中间件顺序 = 认证与闸门的先后关系变（当前闸门在认证外层是有意设计）。配套 `TestGracefulShutdown*`、`TestShutdownMutationMiddleware`。 |
| `internal/api/download_queue.go#Enqueue`/`ErrQueueClosed` | 所有入队入口（HTTP/Bot/Scheduler）共用 `enqueueTask`/`EnqueueTask`；拒绝必须转 Failed。改 `ErrQueueClosed` 语义 = §7.3 的"假已排队"防护失效，`TestDownloadQueue*` 锁定。 |
| `internal/api/log_handlers.go`（`handleGetLogs`/`handleLogStats`/`matchLogLevel`/`matchLogDomain`） | Web1/2/3 三个前端都消费该 API（level/q/domain/时间过滤、FATA→ERROR 统计）；SSE 端点复用 `isValidLogLevel`。改过滤/统计语义 = 三套前端同步适配。 |
| `internal/logging/sanitize.go` + `rotation.go` + `lumberjack_hook.go` | 脱敏与轮转是**三处独立消费**：`LumberjackHook`（tmd2.log）、`consolelog.Hub.Add`（Web 快照）、`cli.SetClientLogger`（client.log）。改任一入口必须保持"写日志前必过 sanitize"的不变量；轮转参数被 `readme.md`、`main.go`、`TestNewRotatingWriterContract` 三方引用。 |
| `internal/api/resource_handler.go`（`defaultJSONBodyLimit`/`rawContentBodyLimit`）与 `download_handlers.go`（`maxUploadRequestSize`/`maxUploadFileSize`） | 413/400 语义 = 前端上传/编辑表单的契约（§8）。改上限 = 前端提示文案与上传校验同步改。 |
| `internal/config/config.go`（`Validate` 的 `normalizeInt`） | `max_user_fetch_concurrent`（1–35）/`max_download_routine`（≤100）的 clamp 与默认值；`config_test.go` 的字段顺序测试锁定 Web 表单顺序（`max_download_routine` 必须紧跟 `max_user_fetch_concurrent`）。 |

> 总原则：上面任何一项的改动，先跑 §10 里对应该子系统的锚点测试，再考虑整仓门禁（`go test -race -count=1 ./...` + `go vet ./...`）；涉及文档或 lat.md 的改动最后补 `lat check`。不要为了"让某个症状消失"去绕过上面任一不变量——它们多数是历史上真实事故（WAL 丢提交、空库覆盖、误删媒体、基线回退、假已排队）换来的防护。
