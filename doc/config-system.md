# 配置系统文档（conf.yaml / 环境变量 / 运行期生效范围）

> 本文档描述 TMD 的配置来源、解析顺序、字段校验、写入原子性与**运行期生效语义**。
> 所有事实均在源码中核对，锚点统一使用符号形式（`文件#符号`），不使用行号。
> 涉及的关键文件：`main.go`、`internal/config/`、`internal/api/config_handlers.go`、`internal/api/server.go`、`internal/api/middleware.go`、`internal/path/store.go`。

---

## 1. 两层根目录：app root 与下载根

配置系统里有两个**互相独立**的"根"：一个属于程序自己的配置/日志（app root），一个属于下载产物与数据库（下载根 `root_path`）。两者可以位于不同磁盘。

| 概念 | 解析入口 | 解析顺序 | 承载内容 |
|------|----------|----------|----------|
| app root | `main.go#resolveAppRootPath` | ① `TMD_HOME`（TrimSpace 非空则 `filepath.Abs`）② Windows: `%APPDATA%\.tmd2` ③ 其他平台: `$HOME/.tmd2` | `conf.yaml`、`bot_config.yaml`、`schedules.yaml`、`additional_cookies.yaml`、`tmd2.log`、`client.log`、`backups/` |
| 下载根 `root_path` | 配置值 → `internal/path/store.go#NewStorePath` | ① `conf.yaml` 的 `root_path` ② `TMD_ROOT_PATH`（覆盖文件值）③ 无默认值，必填 | `users/`（媒体）、`.data/foo.db`、`.data/errors.json`、`.data/json_errors.json` |

```go
// main.go#resolveAppRootPath
TMD_HOME (非空)  → filepath.Abs(TMD_HOME)
GOOS == windows  → filepath.Join(APPDATA, ".tmd2")
其他             → filepath.Join(HOME, ".tmd2")
两者皆空         → 报错 "failed to get home path from env; set TMD_HOME to the app config directory"
```

- app root 由 `main.go#run` 创建（`os.MkdirAll(appRootPath, 0755)`），并在其后派生 `confPath = appRootPath/conf.yaml`、`cliLogPath`、`logPath`。**app root 没有对应的配置字段**，只能通过 `TMD_HOME` 或系统环境变量影响。
- 下载根是普通配置字段（见第 2 节），归一化实现全仓唯一：`internal/path/store.go#NormalizeRoot`（TrimSpace → 非空校验 → `filepath.Abs(filepath.Clean(root))`）。`internal/config/config.go#normalizeRootPath` 在其之上追加**急切建目录** `os.MkdirAll(absPath, 0755)`，因此 API 保存 `root_path` 时目录会被立刻创建。
- 两者不要在语义上混用：`TMD_HOME` 不会改变下载位置，改 `root_path` 也不会移动 app root 下的配置文件。

---

## 2. 字段清单

字段定义集中在 `internal/config/config.go#GetFieldDefs`（`FieldDef` 结构：`Name`/`EnvName`/`Prompt`/`Default`/`Getter`/`Setter`）。`Getter`/`Setter` 同时被**交互式向导**、**环境变量覆盖**和 **API 字段接口**复用，是唯一的字段行为来源。

### 2.1 向导内 8 个字段（按提问顺序）

| # | 字段 | 环境变量 | 向导提示 | 默认值 | 取值范围 / 约束 | 敏感 |
|---|------|----------|----------|--------|------------------|------|
| 1 | `root_path` | `TMD_ROOT_PATH` | `enter storage dir` | 空（必填） | 非空；归一化为绝对路径并建目录 | 否 |
| 2 | `auth_token` | `TMD_AUTH_TOKEN` | `enter auth_token` | 空 | 无校验（原样赋值） | 是 |
| 3 | `ct0` | `TMD_CT0` | `enter ct0` | 空 | 无校验（原样赋值） | 是 |
| 4 | `max_download_routine` | `TMD_MAX_DOWNLOAD_ROUTINE` | `enter max download routine` | `min(50, GOMAXPROCS(0)*10)` | 1–100（Setter 越界报错） | 否 |
| 5 | `max_user_fetch_concurrent` | `TMD_MAX_USER_FETCH_CONCURRENT` | `enter max user media fetch concurrent` | `3` | 0（=默认）/ 1–35 | 否 |
| 6 | `max_file_name_len` | `TMD_MAX_FILE_NAME_LEN` | `enter max file name length (50-245)` | `utils.DefaultMaxFileNameLen` = `158` | 50–245（Setter 用 `clampInt` 截断） | 否 |
| 7 | `proxy_url` | `TMD_PROXY_URL` | `enter proxy url (e.g., http://127.0.0.1:7897, leave empty for system proxy)` | 空 | 白名单 scheme（见 3.4） | 否 |
| 8 | `api_key` | `TMD_API_KEY` | `enter API key for HTTP auth (leave empty to disable)` | 空 | 非空时至少 8 字符 | 是 |

> `max_download_routine` 的默认值由 `internal/config/config.go#DefaultMaxDownloadRoutine` 计算（`min(50, runtime.GOMAXPROCS(0)*10)`）；`max_user_fetch_concurrent` 由 `internal/config/config.go#DefaultMaxUserFetchConcurrent` 固定返回 `3`；`max_file_name_len` 复用 `internal/utils/fs.go#DefaultMaxFileNameLen`（`158`）。
> 字段顺序不是随意的：`config_test.go#TestFieldDefsOrderPlacesUserFetchNextToDownloadRoutine` 与 `internal/api/config_handlers_test.go#TestConfigFieldItemsPlacesUserFetchNextToDownloadRoutine` 固化"抓取并发紧跟下载并发"的顺序。

### 2.2 不在向导内的字段

| 字段 | 环境变量 | 说明 |
|------|----------|------|
| `bind_address` | **无** | API Server 监听地址。只能编辑 `conf.yaml`。空值 = 监听所有网卡；消费点 `main.go#runServer` → `internal/api/server.go#Server.SetBindAddress` → `internal/api/server.go#serverListenAddr`。`NormalizeLoadedConf` 只做 TrimSpace。 |

`bind_address` 既不在 `GetFieldDefs()` 中（因此**不会**被向导提问、**不会**被 `ApplyEnv` 覆盖、**不会**出现在 `/api/v1/config/fields` 响应里，也**不参与** `HasEnvOverrides`），也不在 API 字段保存流程中。

### 2.3 API 展示元数据

`internal/api/config_handlers.go#buildConfigFieldMeta` 为字段补充 UI 元数据：标签、类型（`text`/`number`/`password`）、分组（`basic`/`cookie`/`advanced`/`security`）、占位文案，并对 `auth_token`/`ct0`/`api_key` 打上 `IsSensitive`。`Required` 的判定是 `fd.Default == ""`（因此 `root_path`/`auth_token`/`ct0`/`proxy_url`/`api_key` 为 true），它只是随响应下发的提示性标志——前端 `internal/api/web/{web1,web2,web3}/app.js` 目前并不读取该字段做表单校验，真正的启动校验只有 `Validate`（只要求 `root_path`，见第 5 节）。

---

## 3. 输入校验与归一化

### 3.1 `normalizeInt` 语义

`internal/config/config.go#normalizeInt(val, zeroReplacement, lo, hi)`：

```go
val < 0            → zeroReplacement
val > 0 && val < lo → lo
val > hi            → hi
其他（含 val == 0）  → val 原样保留
```

`0` 被**刻意保留**，因为 `0` 是全系统的"使用默认值"哨兵；消费者在读取时替换为默认值（`internal/api/config_handlers.go#Server.handleConfig`、`internal/service/download_service.go#downloadServiceImpl.maxDownloadRoutine`、`internal/downloading/types.go#RuntimeOptions.normalizedMaxDownloadRoutine` / `normalizedMaxUserFetchConcurrent` / `normalizedMaxFileNameLen`）。

三处调用点（`internal/config/config.go#NormalizeLoadedConf`，均传 `zeroReplacement = 0`）：

| 字段 | `normalizeInt` 实参 | 负数 | 1 … lo-1 | 超上限 |
|------|---------------------|------|----------|--------|
| `max_download_routine` | `(val, 0, 0, 100)` | → 0（默认） | 不适用（lo=0） | → 100 |
| `max_user_fetch_concurrent` | `(val, 0, 1, 35)` | → 0（默认） | 不适用（lo=1） | → 35 |
| `max_file_name_len` | `(val, 0, 50, 245)` | → 0（默认 158） | → 50（如 `1`…`49`） | → 245 |

### 3.2 解析辅助函数

| 函数 | 行为 |
|------|------|
| `internal/config/config.go#parseIntWithDefault` | TrimSpace；空串 → 返回默认值且不报错；否则 `strconv.Atoi`，失败返回错误 |
| `internal/config/config.go#clampInt` | 无错误路径，简单地夹到 `[min, max]`（**小于 min 会升到 min，而不是归零**） |

### 3.3 各字段 Setter 行为

| 字段 | TrimSpace | 空输入 | 非法输入 | 越界处理 |
|------|-----------|--------|----------|----------|
| `root_path` | 是 | 报错 `storage dir cannot be empty` | `path.NormalizeRoot` 错误（如 `filepath.Abs` 失败） | 归一化为绝对路径 + `MkdirAll 0755` |
| `auth_token` | 否 | 置空 | 无 | 无 |
| `ct0` | 否 | 置空 | 无 | 无 |
| `max_download_routine` | 内部 | → 默认值 | `invalid number: …` | `< 1` → `must be at least 1`；`> 100` → `must not exceed 100`（**拒绝**，不截断） |
| `max_user_fetch_concurrent` | 内部 | → `3` | `invalid number: …` | `< 0` → `must not be negative`；`> 35` → `must not exceed 35`；`0` 合法（=默认） |
| `max_file_name_len` | 内部 | → `158` | `invalid number: …` | `clampInt(n, 50, 245)`，**永不报错**（`-5` 会被升为 `50`） |
| `proxy_url` | 是 | 置空（合法） | 见 3.4 | 见 3.4 |
| `api_key` | 是 | 置空（=关闭认证） | 长度 1–7 → `api_key must be at least 8 characters when set` | 无 |

### 3.4 `normalizeProxyURL` 白名单与报错脱敏

`internal/config/config.go#normalizeProxyURL` 的校验步骤与失败文案：

| 检查 | 失败文案 |
|------|----------|
| `strings.Contains(raw, "://")` | `invalid proxy URL %q: missing scheme or host` |
| `url.Parse` | `invalid proxy URL %q: malformed URL` |
| `parsed.Scheme == "" \|\| parsed.Host == ""` | `invalid proxy URL %q: missing scheme or host` |
| scheme 白名单（大小写不敏感）：`http` / `https` / `socks5` / `socks5h` | `invalid proxy URL %q: unsupported scheme %q` |

通过后返回值是 **`parsed.String()`**（规范化后的 URL，userinfo 凭据保留在配置值中，只用于连接）。

失败文案里的 URL 一律经 `internal/config/config.go#proxyURLForError` 处理：

- 含 `@`（可能带 userinfo）→ 补占位 scheme 后走 `internal/logging#SanitizeURL`，再剥掉占位 scheme；
- 否则 → `internal/logging#RedactSensitiveText`。

覆盖用例：`config_test.go#TestNormalizeProxyURLDoesNotExposeCredentialsInErrors`（`ftp://proxy-user:proxy-password@example.invalid:21`、`http://proxy-user:proxy-password@%zz`）。

### 3.5 Setter 与 YAML 归一化的**行为差异**（重要）

同一字段经"API/向导 Setter"与"conf.yaml 加载路径（`NormalizeLoadedConf` → `normalizeInt`）"得到的结果并不一致：

| 字段 | 输入 | API / 向导（Setter） | conf.yaml（`normalizeInt`） |
|------|------|----------------------|------------------------------|
| `max_download_routine` | `500` | 400 报错 `must not exceed 100` | 静默截断为 `100` |
| `max_download_routine` | `-1` | 400 报错 `must be at least 1` | 归一为 `0`（=默认） |
| `max_file_name_len` | `-5` | 被夹为 `50` | 归一为 `0` → 运行时默认 `158` |
| `max_user_fetch_concurrent` | `-1` | 400 报错 `must not be negative` | 归一为 `0`（=默认） |
| `max_file_name_len` | `9999` | 被夹为 `245` | 截断为 `245` |
| `api_key` | `"  abc  "` | TrimSpace → `abc`（长度校验基于 trim 后） | TrimSpace → `abc` |

结论：**手改 `conf.yaml` 是"宽容模式"（截断/归零），API 与向导是"严格模式"（报错或夹取）**。需要排查"配置没生效"时，先确认该值是从哪条路径写入的。

---

## 4. 启动加载决策树

入口：`main.go#run` → `internal/config/config.go#LoadStartupConfig(confPath, bootstrap.confArg, os.Stderr)`（`prompt` 参数**只**由 `-conf` 决定），内部委托 `internal/config/config.go#loadStartupConfig(path, prompt, stderr, promptFn)`（`promptFn` 可注入，测试用）。

```
loadStartupConfig
├── ReadConf(path) → ParseConfYAML（KnownFields(true)）
│   ├── 文件不存在 (os.IsNotExist)
│   │   ├── prompt==true || !HasEnvOverrides()
│   │   │       → stderr: "Config file not found, creating new configuration..."
│   │   │       → promptFn(path)      // 写 conf.yaml
│   │   │       → Prompted = true
│   │   └── 否则（无交互 + 至少一个 TMD_* 非空）
│   │           → conf = &Config{}    // 不落盘
│   │           → UsedEnvFallback = true
│   ├── 其他错误 → 返回错误（启动失败，包装为 "[startup] config load failed"）
│   └── 读取成功
│       └── prompt==true → promptFn(path)（**覆盖已有文件**）→ Prompted = true
└── prompt==false → ApplyEnv(conf) → EnvApplied = applied
```

### 4.1 `StartupLoadResult` 字段含义

| 字段 | 含义 | 触发条件 |
|------|------|----------|
| `Config` | 最终生效的配置对象 | 总是被赋值 |
| `EnvApplied` | 至少一个 `TMD_*` 非空且成功套用 | 仅 `prompt == false`；向导模式**恒为 false**（向导不读环境变量） |
| `UsedEnvFallback` | `conf.yaml` 缺失且未走向导 → 纯环境变量启动 | 文件缺失 + 无交互 + `HasEnvOverrides()` 为真 |
| `Prompted` | 调用了 `promptFn` → `conf.yaml` 已落盘 | 文件缺失走进导，或 `-conf` 对已存在文件重新提问 |

`main.go#run` 据此打印 `[config] Env fallback used path=…` / `[config] Env configuration applied prefix=TMD_`。

### 4.2 环境变量覆盖

- `internal/config/config.go#HasEnvOverrides`：只要 8 个字段的环境变量中**任一** TrimSpace 后非空即返回 true。注意 `TMD_PORT`、`TMD_HOME` **不在此列**（见第 8 节踩坑）。
- `internal/config/config.go#ApplyEnv`：在**副本**上逐字段调用对应 `Setter`，全部成功才 `*conf = next`（**all-or-nothing**，失败时不部分应用且返回错误）。任一 `TMD_*` 非法（如 `TMD_MAX_DOWNLOAD_ROUTINE=not-a-number`、`TMD_PROXY_URL=ftp://…`）会导致**启动失败**，而不是忽略该项。
- 覆盖优先级（高 → 低）：**`-conf` 向导（忽略环境变量）** > **`TMD_*` 环境变量**（覆盖文件中的同名字段） > **`conf.yaml`** > **内置默认值**（`0`/空 哨兵在运行时替换）。
- 相邻行为：`proxy_url` 非空时 `main.go#run` 会把它写入 `HTTP_PROXY`/`HTTPS_PROXY`；为空时只在系统已有的 `HTTP_PROXY`/`HTTPS_PROXY`（含小写形式）中把**缺失的一侧补齐**，不覆盖已有值。

### 4.3 `-conf` 行为

```bash
tmdp -conf        # 进入交互式向导；文件已存在也会重新提问并覆盖
```

`PromptConfig`（`internal/config/config.go#PromptConfig`）流程：

1. 空 `Config{}`，`bufio.Scanner(os.Stdin)`；
2. 按 `GetFieldDefs()` 顺序对每个字段向 **stderr** 打印 `"{Prompt} [{Default}]: "`，读一行 → `field.Setter`；
3. 空行 = 使用默认值（但 `root_path` 的默认值为空 → Setter 直接报错，所以存储目录必须真实输入）；
4. Scanner 失败 / EOF → `failed to read input for <name>` / `unexpected EOF while reading <name>`（启动失败）；
5. 任一 Setter 失败 → `failed to set <name>: …`；
6. 写盘前 `CreateBackup(saveto)`（失败仅 `log.Warnf`），随后 `WriteConf(saveto, conf)`。

`-conf` 完成后 `main.go#run` 打印 `[config] Config template written` 并 **`return nil`（退出码 0）**：不执行 `Validate`，不初始化客户端/DB，不启动 CLI 或 Server。

---

## 5. 校验与归一化（Validate / NormalizeLoadedConf）

### 5.1 `Validate` — 只检查一件事

`internal/config/config.go#Validate`：

| 输入 | 结果 |
|------|------|
| `nil` | `config is nil` |
| `RootPath` TrimSpace 后为空 | `root_path is required; set it in conf.yaml or TMD_ROOT_PATH` |
| 其他 | `nil` |

- 唯一调用点是 `main.go#run`（CLI 与 Server 共用启动路径），且只在 **非 `-conf`** 时执行；失败包装为 `[startup] config validation failed`。
- API 保存路径（`handleSaveConfigFields` / `handleUpdateConfigRaw`）**不调用** `Validate`，字段合法性完全由 Setter 与 `ParseConfYAML` 保证。因此通过 API 保存一份 `root_path` 为空以外的非法配置是不可能的，但 API 也不会因为 `auth_token` 为空而拒绝保存。

### 5.2 `NormalizeLoadedConf` — 读与写共用

`internal/config/config.go#NormalizeLoadedConf` 对**每次读取（`ParseConfYAML`）和每次写出（`MarshalConf`）**都执行：

| 步骤 | 行为 |
|------|------|
| `RootPath` | TrimSpace；**非空时**走 `normalizeRootPath`（`path.NormalizeRoot` + `MkdirAll 0755`），失败返回 `invalid root_path: …`；为空时保持为空，留给 `Validate` 报错 |
| `ProxyURL` | `normalizeProxyURL`，失败返回 `invalid proxy_url: …` |
| `MaxDownloadRoutine` | `normalizeInt(…, 0, 0, 100)` |
| `MaxUserFetchConcurrent` | `normalizeInt(…, 0, 1, 35)` |
| `MaxFileNameLen` | `normalizeInt(…, 0, 50, 245)` |
| `APIKey` / `BindAddress` | TrimSpace |

由此得到两条重要性质：

1. **写出的内容永远已归一化**：`WriteConf` → `MarshalConf`（在副本上归一化）→ 落盘（`config_test.go#TestWriteConfPersistsNormalizedConfig`）；
2. **`conf.yaml` 里的"脏值"在读取时就被修正**，不会带着负数/超限值进入运行时。

### 5.3 未知字段直接失败

`ParseConfYAML` 与 `LoadBotConfig` 都启用 `yaml.Decoder.KnownFields(true)`：

- `conf.yaml` 出现未知键（如把 `root_path` 拼成 `rootpath`）→ 读取报错 → **启动失败** / API 返回 400 `Invalid config`；
- 空文件（`io.EOF`）→ 返回空 `&Config{}`，不报错（`bot_config.yaml` 为空则在 `main.go#runServer` 中走 `isEmptyBotConfigError` 分支跳过 Bot）。

覆盖用例：`config_test.go#TestReadConfRejectsUnknownFields`、`config_test.go#TestParseConfYAMLRejectsInvalidProxyURL`、`internal/api/server_test.go#TestServer_PutRoutesForConfigFieldsAndCookies`。

---

## 6. 写入路径与原子性

### 6.1 `writeFileAtomic` — 唯一落盘实现

`internal/config/config.go#writeFileAtomic(path, data, perm)`：

```
1. os.MkdirAll(filepath.Dir(path), 0755)
2. os.CreateTemp(dir, filepath.Base(path)+".tmp-*")   // 同目录，保证 rename 落在同一文件系统
3. file.Chmod(perm)
4. io.Copy(file, data)
5. file.Sync()  →  file.Close()  →  os.Rename(tmpPath, path)
6. 任一步失败：defer 中删除临时文件（success 标记）
```

调用者与权限：

| 调用者 | 权限 | 用途 |
|--------|------|------|
| `internal/config/config.go#WriteConf` | `0600` | `conf.yaml`（`MarshalConf` 归一化后写出） |
| `internal/config/config.go#writeYAMLFile` | `0600` | `WriteBotConfig`、`WriteAdditionalCookies` |
| `internal/config/bot_config.go#WriteDefaultBotConfig` | `0600` | `bot_config.yaml` 内嵌模板 |

> Windows 上 Go 的 `FileMode` 不表达 ACL，实际权限继承 app 目录 ACL；POSIX 上为 `0600`。

### 6.2 写前备份

`internal/config/backup.go#CreateBackup(filePath)`：

- 源文件不存在 → 返回 `("", nil)`（**不算错误**，首次保存不会失败）；
- 备份落在**源文件同级的 `backups/` 子目录**（`MkdirAll 0700`），文件名 `{base}.backup.{UnixNano}`（`0600`）；
- 写入后调用 `pruneConfigBackups`：按源文件名分组，每源文件**仅保留最近 10 份**（常量 `maxConfigBackupCount`）；
- 返回**相对路径**（如 `backups/conf.yaml.backup.1737000000000000000`），该值会出现在 API 响应与日志 `backup=…` 中。

调用点（全部在写之前，失败仅告警不阻断）：

| 调用点 | 说明 |
|--------|------|
| `internal/config/config.go#PromptConfig` | 向导写盘前 |
| `internal/api/config_handlers.go#Server.handleUpdateConfigRaw` | `PUT /api/v1/config/raw` |
| `internal/api/config_handlers.go#Server.handleSaveConfigFields` | `PUT /api/v1/config/fields` |

### 6.3 `bot_config.yaml` 的自动生成

`main.go#runServer`（仅 **Server 模式**）：

```text
main.go#runServer:
  botConf, err := config.LoadBotConfig(botConfPath)     // KnownFields(true)
  ├─ os.IsNotExist(err)  → config.WriteDefaultBotConfig(botConfPath)  // 写内嵌模板；失败仅 Warnf
  ├─ io.EOF              → 日志 "[startup] Bot config skipped reason=empty"
  └─ 其他 err            → log.Warnf（不中断启动）
```

- 模板内容来自 `internal/config/default_bot_config.yaml`，经 `//go:embed` 打进二进制（`internal/config/bot_config.go`）；
- 原子写入，请求权限 `0600`；
- 文件存在（即使为空）时**不会**被覆盖——已注释的模板不会因为重启被重置；
- Bot 配置与 `conf.yaml` 完全独立：Bot 走平台自身协议，不经 HTTP API，因此不受 `api_key` 影响（详见 `doc/bot-integration.md`）。

---

## 7. 运行期语义：什么立即生效、什么需要重启

### 7.1 三份"配置"的关系

```
main.go#run
  conf := loadResult.Config                       ← 启动时加载的配置对象
  ├── CLI 模式：cli.Dependencies{ …, Config: conf }
  └── Server 模式：api.NewServerWithConsoleLogHub(client, …, conf, appRootPath, …)
        │
        ├── Server.config = conf                  ← 【展示副本】API 读写的就是它
        │
        └── configCopy := *config                 ← 【构造时快照】（值拷贝）
            service.Dependencies.Config = &configCopy
                 ↑ downloadService（并发数/文件名长度/…）
                   DownloadQueue → server.downloadService
                   scheduler → Server.scheduledDownload → createAndEnqueueTask → buildTaskRunFunc
```

`internal/api/server.go#NewServerWithConsoleLogHub` 中的注释明确了这条设计：`configCopy` 让运行时依赖持有**独立副本**，因此 `handleUpdateConfigRaw` 里的 `*s.config = *testConf` 只影响展示副本。

### 7.2 结论：绝大多数配置**需要重启**

- `PUT /api/v1/config/fields` 与 `PUT /api/v1/config/raw` 都先写 `conf.yaml`，再整体覆盖展示副本（`*s.config = *newConf` / `*s.config = *testConf`）。
- 并发数、文件名长度、`root_path`（DB 与存储目录在 `main.go#initializeClients` 中按启动时的值建好）、`proxy_url`（`main.go#run` 启动时写入 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量）等，**运行时组件读的是快照**，因此保存后必须重启 TMD。
- 接口响应文案直接反映了这一点：无 `api_key` 变更时返回 `"Configuration saved successfully. Please restart TMD manually for changes to take effect."`。
- 副作用：保存后 Web UI 显示的 `max_download_routine` 等值是**新值**，而实际并发仍是重启前的值——这不是显示 bug，而是"展示副本 ≠ 运行时快照"的必然结果。

| 字段 / 配置 | 保存后生效方式 |
|-------------|----------------|
| `api_key` | **立即生效**（见 7.3） |
| `auth_token` / `ct0` | 需重启（Twitter 客户端与附加客户端在启动时构建） |
| `max_download_routine` / `max_user_fetch_concurrent` / `max_file_name_len` | 需重启（service 持快照 → `RuntimeOptions`） |
| `proxy_url` | 需重启（进程环境变量在启动时设置） |
| `root_path` | 需重启（数据库与 `users/`、`.data/` 目录在启动时创建）；旧目录内容**不会**自动搬移 |
| `bind_address` | 需重启，且只能手改 `conf.yaml`（不在 API 字段中） |
| `bot_config.yaml` | 需重启（`main.go#initBot` 在启动时构建 Bot 列表） |

### 7.3 例外：`api_key` 每请求读取

`internal/api/middleware.go#Server.authMiddleware` 在**每个请求**中执行：

```go
s.configMu.RLock()
apiKey := s.config.APIKey
s.configMu.RUnlock()
if apiKey == "" { /* 放行 */ }
```

`internal/api/auth_jwt.go` 的 login/refresh/check 处理器同样每次现读 `s.config.APIKey`。并且 JWT 的 HMAC 密钥由 `api_key` 派生（`internal/api/auth_jwt.go#deriveJWTSecret`），所以**改 key 会立刻作废所有已签发会话**；前端（`web1/web2/web3` 的配置保存逻辑）在检测到 `api_key` 变更时会清掉 `localStorage` 中的 JWT。

### 7.4 `/api/v1/config/fields` 的哨兵值与掩码

| 语义 | 值 | 说明 |
|------|-----|------|
| 保留旧值 | 缺键 / 空串 / `"__KEEP_OLD__"` | 取 `GetFieldValue(newConf, fd)`，为空则用 `fd.Default` |
| 显式清空 | `"__CLEAR__"` | 置为空串；前端只对可安全清空的 `api_key` 使用（web2 会弹确认框，因为清空 = 关闭 HTTP 认证） |
| 拒绝 | 掩码值 | `"***"` 或含 `"•••"`（`internal/api/config_handlers.go#isMaskedValue`）→ 400，防止把 `maskSensitive` 输出当作真实值回传 |

- 读取侧：`buildConfigFieldItems` 对 `IsSensitive` 字段调用 `internal/api/config_handlers.go#maskSensitive`（长度 ≤ 6 显示 `"***"`，否则 `前3字符 + "•••" + 后3字符`），**明文永不回传**；
- 写入侧：逐字段 Setter 校验，**任一字段失败立即整体 400 且不写盘**（备份与写盘发生在全部校验通过之后）；
- 成功响应体包含 `message`、`backup`（相对路径）、`yaml_preview`，字段接口额外返回重新掩码后的 `fields`。

### 7.5 `/api/v1/config/raw`

| 方法 | 行为 |
|------|------|
| `GET` | 直接读 app root 下的 `conf.yaml`；文件缺失时返回 `Exists=false` + 归一化后的默认 YAML（`config.MarshalConf(&Config{})`），并给出 `Path` |
| `PUT` | 请求体 `{"content": "<yaml>"}`，先 `ParseConfYAML`（含 `KnownFields`、proxy 校验、归一化）→ 失败 400 `Invalid config`；成功则备份 + `WriteConf` + 覆盖展示副本 |

### 7.6 另一个读展示副本的点（注意差异）

`internal/api/download_handlers.go#Server.handleErrors` 直接使用 `path.NewStorePath(s.config.RootPath)`（展示副本）；而真正执行下载与清理的 service 一律使用自己的副本（`internal/service/download_service.go#downloadServiceImpl.storePathFor`、`validateJsonPaths` 均读 `s.deps.Config.RootPath`）。[INFERENCE] 因此保存新的 `root_path` 而不重启时，只有"错误摘要"接口会立刻指向新目录（通常读到空数据），下载与 DB 仍在旧 root。这是 `internal/api` 内**唯一**把展示副本用于业务数据的地方（`s.config` 的其余使用点是配置读写与认证，见 7.3/7.5）。

---

## 8. 端口分层

端口不属于 `FieldDef`（没有 `TMD_PORT` 字段定义），由启动参数与环境变量单独分层解析：

```go
// main.go#run
bootstrap, err := parseBootstrapArgs(args)   // -port <n>
if !bootstrap.serverPortSet {
    serverPort, err = serverPortFromEnv()    // TMD_PORT
} else {
    serverPort = bootstrap.serverPort
}
if serverPort == 0 { serverPort = 25556 }
```

| 层级 | 来源 | 校验 | 失败行为 |
|------|------|------|----------|
| 1（最高） | `-port <n>` | `strconv.Atoi` 成功且 `1 ≤ n ≤ 65535`；缺值同样报错 | `invalid -port %q: must be an integer from 1 to 65535` / `-port requires a value` |
| 2 | `TMD_PORT` | TrimSpace；空 → `0`（未设置）；否则同上范围校验 | `invalid TMD_PORT %q: must be an integer from 1 to 65535` |
| 3（默认） | 内置 `25556` | — | — |

要点：

- 端口解析发生在 `resolveAppRootPath()` 与 `config.LoadStartupConfig()` **之前**，所以非法端口会在读取配置前失败（`main_test.go#TestRunReturnsBootstrapErrors` 直接断言 `run([]string{"-port","invalid"})` 的错误文案）；
- `parseBootstrapArgs` 只识别 `-conf` / `-dbg` / `-server` / `-port`，其余参数（含 `-port` 的值）按顺序透传给 CLI（`bootstrapArgs.cliArgs`）；
- `-port` 只在 Server 模式被消费（`main.go#runServer` → `internal/api/server.go#Server.Start(port)`），CLI 模式解析但不使用；
- `TMD_PORT` **不参与** `HasEnvOverrides()`，因此只设置 `TMD_PORT` 不会触发"环境变量 fallback"（`conf.yaml` 缺失时仍会进入向导）。

---

## 9. 与安全边界的关系

配置直接决定 HTTP 面的安全边界，三条链路都在 `internal/api` 中：

### 9.1 `api_key` 为空即完全放行

`internal/api/middleware.go#Server.authMiddleware`：

```go
apiKey := s.config.APIKey           // 每请求现读（configMu.RLock）
if apiKey == "" { next.ServeHTTP(w, r); return }   // 认证关闭 → 全部放行
```

- 为空时不仅"配置接口"可用，**删除/关停等破坏性端点同样无认证**；
- 非空时支持两种凭据：JWT（`Authorization: Bearer`，SSE 回退 `?token=`）与**原始 `api_key` 字符串直接比较**；
- 公开路径（健康检查、主题配置、Web UI 页面、静态文件）与 `internal/api/server.go#Server.RegisterBotCallback` **精确登记**的 Bot 回调路径免认证（不是宽泛的 `/api/v1/bot/` 前缀）。

### 9.2 非 loopback 监听且无 key → 启动告警

`internal/api/server.go#Server.Start` 在监听前调用 `internal/api/server.go#shouldWarnUnsafeBind(bindAddress, s.currentAPIKey())`：

| `bind_address` | 有 `api_key` | 结果 |
|----------------|--------------|------|
| `127.0.0.1` / `::1` / `localhost` | 任意 | 不告警（loopback 白名单为**精确字符串匹配**） |
| 空（→ `":25556"`，监听所有网卡） | 否 | **告警** |
| `0.0.0.0` 或任意其他地址 | 否 | **告警** |

告警文案：`Listening on a non-loopback address without an API key — any host on the local network can reach delete/shutdown endpoints. Set api_key or bind to 127.0.0.1.`（仅告警，不阻止启动）。
地址拼接：`internal/api/server.go#serverListenAddr`：空 → `":port"`，非空 → `net.JoinHostPort(bindAddress, port)`。

### 9.3 凭据落盘与脱敏

- `conf.yaml` 含明文 `auth_token`/`ct0`/`api_key`，且 `proxy_url` 可能内嵌 userinfo → 该文件以 **`0600`** 原子写入（第 6 节），并随每次保存进入 `backups/`（`0600`）；备份目录本身 `0700`。
- 代理 URL 校验失败的**错误信息**绝不回显 userinfo（`proxyURLForError`，见 3.4），并且这个脱敏错误会经 `internal/api/config_handlers.go` 的 `writeErrorDetail` 返回给前端，所以脱敏是必要的而非装饰。
- 敏感字段在 API 读取时一律掩码，掩码值回传会被拒绝（7.4）。
- 一旦修改或清空 `api_key`，所有已签发 JWT 立即失效（HMAC 密钥由 key 派生）——轮换 key 是唯一可用的会话吊销手段。

---

## 10. 踩坑清单

按"现象 → 原因 → 处置"列出，全部有源码依据。

| # | 现象 | 原因 | 处置 |
|---|------|------|------|
| 1 | `conf.yaml` 写 `max_download_routine: 0`，日志显示并发仍是默认值 | `0` 是"使用默认值"哨兵，`NormalizeLoadedConf` 刻意保留 0 | 想显式指定就写 1–100；想恢复默认就写 0 或删掉该键 |
| 2 | 同一非法值在 `conf.yaml` 里"没报错"，在 API/向导里却 400 | Setter 是严格模式、`normalizeInt` 是宽容模式（见 3.5） | 以 API/向导报错为准；修 `conf.yaml` 时注意负数会被归零（=默认）而非报错 |
| 3 | `max_file_name_len: -5` 看起来"生效了" | 归一为 `0` → 运行时回退 `158`；而 API 提交 `-5` 会变成 `50` | 别用负数表达"默认"；显式写 `0` 或删键 |
| 4 | 启动直接失败，报 `yaml: unmarshal errors: … field rootpath not found` | `KnownFields(true)` 拒绝未知键 | 对照第 2 节表核对 YAML 键名（`root_path`、`cookie` 下的 `auth_token`/`ct0`）；断言见 `config_test.go#TestReadConfRejectsUnknownFields` |
| 5 | `proxy_url: 127.0.0.1:7897` 启动失败 | `normalizeProxyURL` 要求内含 `://` | 写全 scheme：`http://127.0.0.1:7897`；scheme 仅支持 `http`/`https`/`socks5`/`socks5h` |
| 6 | 通过 API 改了 `root_path`，但下载/数据库仍在旧目录，而"错误摘要"却空了 | 运行时组件持构造时快照；只有 `handleErrors` 读展示副本（7.6） | 改 `root_path` 后**必须重启**；旧目录内容不会自动搬移 |
| 7 | 改了并发数保存成功，实际并发没变 | 同上（`service` 持快照），响应文案已提示 `Please restart TMD manually …` | 重启进程；不要把 UI 显示值当成运行时值 |
| 8 | 改了 `api_key` 后网页立刻要求重新登录 | JWT HMAC 由 `api_key` 派生，旧令牌全部失效 | 属预期行为；前端会清 `localStorage` 中的 JWT。清空 `api_key` = 关闭整个 HTTP 认证（web2 有二次确认） |
| 9 | 保存字段接口返回 400 `contains a masked placeholder value` | 把 `abc•••xyz` / `***` 之类的掩码值当成真实值提交 | 不变就留空或传 `__KEEP_OLD__`；要清空只对 `api_key` 传 `__CLEAR__` |
| 10 | 只设了 `TMD_PORT`（或 `TMD_HOME`），启动还是进了向导 | `HasEnvOverrides` 只看 8 个字段环境变量 | 至少设置一个 `TMD_*` 字段变量，或用 `-conf` 事先写好 `conf.yaml` |
| 11 | `TMD_MAX_DOWNLOAD_ROUTINE=abc` 导致启动失败而不是被忽略 | `ApplyEnv` all-or-nothing，且错误直接冒泡为 `[startup] config load failed` | 环境变量拼错/非法要当场修正；不要指望回退到文件值 |
| 12 | 在无交互环境（CI/服务）里跑 `-conf` 失败并报 `unexpected EOF while reading …` | 向导读 stdin，且逐字段失败即中止 | `-conf` 只在交互式终端使用；自动化请直接写 `conf.yaml` 或用 `TMD_*` |
| 13 | `conf.yaml` 里保存的 `root_path` 变成绝对路径、目录被"凭空"创建 | `normalizeRootPath` 归一化 + 急切 `MkdirAll 0755`（`NormalizeLoadedConf` 在读取路径上也会触发） | 属预期；相对路径会被 `filepath.Abs` 解析成**相对当前工作目录**的绝对路径，所以同一份相对配置在不同 cwd 启动会指向不同目录——建议始终写绝对路径 |
| 14 | 找了很久"上次的备份" | 备份在 `{appRootPath}/backups/`，且每源文件只保留最近 10 份 | 需要长期留存请自行复制；文件名含纳秒时间戳 |
| 15 | 改了 `bot_config.yaml` 但 Bot 行为没变；或模板被注释后重启丢失 | Bot 在启动时构建；模板**只在文件缺失时**写入 | 重启；模板不会被覆盖，但也不会自动补全新字段 |
| 16 | 以为 `max_user_fetch_concurrent` 不在向导中（`readme.md` 末尾注记如此写） | 该注记与同文件向导列表（第 5 步）及源码矛盾：`GetFieldDefs()` 含该字段，`PromptConfig` 逐项提问 | 以源码为准（`config_test.go#TestFieldDefsOrderPlacesUserFetchNextToDownloadRoutine`）；`readme.md` 该注记待修 |

---

## 11. 验证命令

### 11.1 单元测试（函数名取自实际 grep 结果）

```bash
# 配置包全量（字段 Setter、Env 覆盖、归一化、加载决策树、原子写、Bot 模板）
go test ./internal/config/ -count=1

# API 侧：字段接口哨兵/掩码/生效文案、raw 校验、端口绑定告警
go test ./internal/api/ -run 'Test(ResolveBindAddress|WarnsWhenBindingNonLoopbackWithoutAPIKey|MaskSensitive|IsMaskedValue|ConfigFieldItemsPlacesUserFetchNextToDownloadRoutine|HandleSaveConfigFields|HandleUpdateConfigRaw|Server_PutRoutesForConfigFieldsAndCookies)' -count=1

# 启动参数与启动校验
go test . -run 'Test(ParseBootstrapArgs|RunReturnsBootstrapErrors|ValidateConfigRequiresRootPath|IsEmptyBotConfigError)' -count=1
```

| 断言内容 | 测试函数 |
|----------|----------|
| `normalizeInt` 四类分支（负数/零/低于 lo/超上限） | `config_test.go#TestNormalizeInt_ReturnsZeroForNegatives`、`#TestNormalizeInt_ClampsAboveHi`、`#TestNormalizeInt_ClampsBelowLo`、`#TestNormalizeInt_PreservesZero`、`#TestNormalizeInt_PreservesValidRange` |
| 三个整数字段的默认值来源 | `config_test.go#TestMaxDownloadRoutineFieldUsesConfigDefault`、`#TestMaxUserFetchConcurrentFieldUsesConfigDefault`、`#TestMaxFileNameLenFieldUsesUtilsDefault` |
| proxy 校验与错误脱敏 | `config_test.go#TestProxyURLFieldNormalizesAndValidates`、`#TestNormalizeProxyURLDoesNotExposeCredentialsInErrors`、`#TestApplyEnvInvalidProxyURL`、`#TestParseConfYAMLRejectsInvalidProxyURL` |
| 环境变量覆盖（含 all-or-nothing） | `config_test.go#TestApplyEnvOverridesConfig`、`#TestApplyEnvIgnoresEmptyEnvironment`、`#TestApplyEnvInvalidNumber`、`#TestApplyEnvDoesNotPartiallyApplyOnError` |
| 读取归一化 / 未知字段拒绝 / 写出归一化 | `config_test.go#TestReadConfNormalizesRuntimeFields`、`#TestReadConfRejectsUnknownFields`、`#TestWriteConfPersistsNormalizedConfig` |
| 加载决策树三分支 | `config_test.go#TestLoadStartupConfigUsesEnvFallbackWhenConfigMissing`、`#TestLoadStartupConfigAppliesEnvOverridesToExistingConfig`、`#TestLoadStartupConfigPromptModeUsesPromptFunction` |
| `Validate` 边界 | `config_test.go#TestValidateRejectsMissingRootPath`、`#TestValidateRejectsNilConfig`、`main_test.go#TestValidateConfigRequiresRootPath` |
| `bot_config.yaml` 模板写入 | `config_test.go#TestWriteDefaultBotConfig` |
| 字段接口哨兵/掩码/生效文案 | `config_handlers_test.go#TestHandleSaveConfigFields_ClearsAPIKey`、`#TestHandleSaveConfigFields_RejectsMaskedValue`、`#TestHandleSaveConfigFields_RejectsShortMaskedValue`、`#TestHandleSaveConfigFields_APIKeyChangedMessage`、`#TestHandleSaveConfigFields_OtherFieldChangedMessage`、`#TestHandleUpdateConfigRaw_APIKeyChangedMessage`、`#TestHandleUpdateConfigRaw_OtherFieldChangedMessage`、`#TestMaskSensitive`、`#TestIsMaskedValue` |
| 绑定地址与告警判定 | `internal/api/bind_address_test.go#TestResolveBindAddress`、`#TestWarnsWhenBindingNonLoopbackWithoutAPIKey` |
| 端口参数 | `main_test.go#TestParseBootstrapArgs`、`#TestParseBootstrapArgsPortValidation`、`#TestParseBootstrapArgsConfIsBoolean`、`#TestRunReturnsBootstrapErrors` |

### 11.2 手工冒烟

```bash
# 1) 向导（交互式终端）
tmdp -conf
#    期望：逐项提问 8 个字段；成功后打印 "[config] Config template written" 并以退出码 0 结束
#    期望：{appRootPath}/conf.yaml 已写出，首次写盘不会失败（源文件不存在时 CreateBackup 返回空名）

# 2) 环境变量 fallback（conf.yaml 缺失且设置任一 TMD_* 字段变量）
TMD_ROOT_PATH=/tmp/tmd-dl tmdp -server
#    期望：日志 "[config] Env fallback used path=..."，不进入向导

# 3) 只设 TMD_PORT 不会触发 fallback
TMD_PORT=25557 tmdp -server
#    期望：仍然进入向导（HasEnvOverrides 不含 TMD_PORT）

# 4) 配置接口（Server 模式，api_key 已设置时需带 Bearer）
curl -s localhost:25556/api/v1/config/fields            # 敏感字段应为掩码（abc•••xyz 或 ***）
curl -s -X PUT localhost:25556/api/v1/config/fields \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"max_download_routine":"10"}}'          # 期望 message: "Please restart TMD manually ..."
curl -s -X PUT localhost:25556/api/v1/config/fields \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"max_download_routine":"500"}}'         # 期望 400: "must not exceed 100"
curl -s -X PUT localhost:25556/api/v1/config/raw \
  -H 'Content-Type: application/json' \
  -d '{"content":"root_path: C:/tmp\nproxy_url: ftp://127.0.0.1:21\n"}'   # 期望 400: unsupported scheme "ftp"

# 5) 端口分层
tmdp -port invalid            # 期望 "[startup] ...invalid -port" / 退出码 1，且不读取配置
tmdp -server -port 25557      # -port 优先于 TMD_PORT
```

### 11.3 相关文档

- `doc/bot-integration.md` — `bot_config.yaml` 的平台字段与回调注册
- `doc/tmd-api-auth-layer.md` — JWT 会话、认证中间件与速率限制细节
- `lat.md/api-server.md` / `lat.md/cli-runtime.md` — 端口、认证与启动顺序的权威摘要
