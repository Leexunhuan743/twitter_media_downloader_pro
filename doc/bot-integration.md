# TMD Bot 集成文档

## 概述

TMD Server 模式支持接入多个 Bot 平台，提供下载控制、任务通知和错误告警能力。目前支持 6 个平台：

| 平台 | 类型 | 命令交互 | 通知推送 |
|---|---|---|---|
| Telegram | 双向命令 + 通知 | ✅ | ✅ 任务完成 + 错误日志 |
| Discord | 双向命令 + 通知 | ✅ | ✅ 任务完成 + 错误日志 |
| WeChat iLink | 双向命令 + 通知 | ✅ | ✅ 任务完成 + 错误日志 |
| 飞书 / Lark | 双向命令 + 通知 | ✅ | ✅ 任务完成 + 错误日志 |
| Gotify | 单向推送 | ❌ | ✅ 任务完成 + 错误日志 |
| Pushover | 单向推送 | ❌ | ✅ 任务完成 + 错误日志 |

---

## 后端架构

### 分层设计

```
Bot Platform (Telegram/Discord/WeChat/Feishu/etc.)
        │
        ▼
  internal/bot/{platform}/
    └── Bot impl (Bot 接口实现)
          ├── Start() / Stop()           ← 生命周期管理
          ├── handle* (消息接收)          ← 命令解析和路由
          ├── cmd* (命令处理)             ← /dl /status /cancel 等
          └── RunBotEventLoop / RunBotLogLoop  ← 事件/日志订阅
                │
                ▼
  internal/api/
    ├── TaskManager     ← 创建/查询/取消任务
    ├── EventBus        ← 订阅任务事件
    └── DownloadQueue   ← 异步执行下载
                │
                ▼
  internal/service/DownloadService  ← 下载业务编排
```

Bot 只调用 `api.TaskManager`、`api.EventBus`、`consolelog.Hub`，不直接接触下载逻辑。双向 Bot（Telegram/Discord/WeChat/Feishu）还持有注入的 `server.EnqueueTask`（main.go:402/405/414/417），创建任务后经它与 HTTP API 同一条路径入队执行（`download_handlers.go` 的 `EnqueueTask`，58-72 行）。

### Bot 接口

```go
type Bot interface {
    Start() error   // 非阻塞启动
    Stop()          // 停止
    Name() string   // 名称（如 "telegram"）
}
```

所有平台实现此接口，通过 `server.InitBot(bots)` 注入到 Server：

```go
// main.go
server.InitBot(initBot(botConf, server))

// internal/api/server.go
func (s *Server) InitBot(bots []bot.Bot) {
    s.bots = bots
}
```

Server 在 `Start()` 中遍历 `s.bots` 依次调用 `b.Start()`，在 `GracefulShutdown()` 中遍历调用 `b.Stop()`。

### 消息流程

**接收消息 → 处理命令**（Telegram 示例）：

```
用户发送 /dl elonmusk
  → Bot 接收消息
  → handleCommand("/dl elonmusk")
  → parseDLArgs → (type="user", target="elonmusk")
  → taskManager.CreateTask(TaskTypeUserDownload, &UserDownloadTaskData{...})
  → server.EnqueueTask(task) 入队下载（telegram/commands.go:61-69；不调用则任务永远停留在 queued）
  → 返回 task_id 给用户
  → DownloadQueue 异步执行下载
```

**通知推送**：

```
任务完成/失败
  → TaskManager 更新状态
  → EventBus.Publish("tasks", tasks)
  → RunBotEventLoop 收到事件（筛选 "tasks" 类型）
  → notifyTaskChanges() 发送消息给用户
```

**日志错误告警**：

```
error/fatal 级别日志
  → consolelog.Hub.Publish(line)
  → RunBotLogLoop 收到日志行（1条/秒速率限制，筛选以 ERRO[/FATA[ 前缀开头的日志行）
  → sendLogAlert() 推送给用户
```

> **通知范围**：任务完成/失败通知**仅发送给发起该任务的用户**（Telegram 的聊天会话、Discord 频道、WeChat/Feishu 的个人用户）。错误日志（error/fatal 级别）推送给所有已交互过的用户（WeChat/Feishu）或配置中的 `allowed_users`（Telegram/Discord）。
---

## 配置方式

所有 Bot 配置在 `{appRootPath}/bot_config.yaml` 中（独立于 `conf.yaml`），未配置的平台不会启动。

### Telegram

```yaml
telegram:
  token: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  allowed_users: [123456789, 987654321]
```

| 参数 | 说明 | 获取方式 |
|---|---|---|
| `token` | Bot token | [@BotFather](https://t.me/BotFather) 创建 Bot 后获取 |
| `allowed_users` | 允许使用的用户 ID（数字） | 向 Bot 发消息 → `https://api.telegram.org/bot<token>/getUpdates` → `message.from.id` |

**可用命令**：`/dl [user|list|foll] <target> [opt=val ...]`、`/status <id>`、`/cancel <id>`、`/tasks`、`/help`
支持选项：`auto_follow`/`af`、`skip_profile`/`sp`、`no_retry`/`nr`、`follow_members`/`fm`
示例：`/dl elonmusk auto_follow=true skip_profile=true`

### Discord

```yaml
discord:
  token: "MTE5ODk4MjQ2NzE4NTMyMTI5OQ.GnO2X.xxx"
  allowed_users: ["123456789012345678"]
```

| 参数 | 说明 | 获取方式 |
|---|---|---|
| `token` | Bot token | [Discord Developer Portal](https://discord.com/developers/applications) → Application → Bot → Reset Token |
| `allowed_users` | 允许使用的用户 ID（字符串） | Discord 设置 → 高级 → 开发者模式 → 右键用户 → Copy ID |

**可用命令**：`/dl [type:user|list|foll] <target>`（可选参数 auto_follow、skip_profile、no_retry、follow_members）、`/status <id>`、`/cancel <id>`、`/tasks`、`/help`

### WeChat iLink

```yaml
wechat:
  credential_path: ".weixin-token.json"
  allowed_users: ["friend@im.wechat"]
```

| 参数 | 说明 | 获取方式 |
|---|---|---|
| `credential_path` | 凭证文件路径（首次登录后自动生成） | 任意可写路径，相对于工作目录 |
| `allowed_users` | 允许使用的联系人 ID | 留空即允许所有用户；当前版本不打印 `FromUserID`，无法从日志获取 |

**首次使用**：启动后 Bot 在后台等待扫码（登录超时 2 分钟），查看服务端日志中的 QR Code URL，用微信扫码登录。后续自动复用凭证。连接断开后 Bot 会自动重连。
**可用命令**：`/dl [user|list|foll] <target> [opt=val ...]`、`/status <id>`、`/cancel <id>`、`/tasks`、`/help`
支持选项同 Telegram。

### 飞书 / Lark

```yaml
feishu:
  app_id: "cli_xxxxxxxxxxxx"
  app_secret: "xxxxxxxxxxxxxxxxxxxxxxxxxx"
  verify_token: "xxxxxxxxxxxx"
  encrypt_key: ""                 # 可选，不配置则不加密
  allowed_users: ["ou_xxxxxxxxxxxxx"]
  callback_path: "/api/v1/bot/feishu/callback"   # 可选，默认值
```

| 参数 | 说明 | 获取方式 |
|---|---|---|
| `app_id` | 应用 App ID | [飞书开发者后台](https://open.feishu.cn/app) → 凭证与基础信息 |
| `app_secret` | 应用 App Secret | 同上 |
| `verify_token` | Verification Token | 事件与回调 → Verification Token |
| `encrypt_key` | Encrypt Key（可选） | 事件与回调 → Encrypt Key |
| `allowed_users` | 允许使用的用户 open_id | 通过[获取用户 open_id API](https://open.feishu.cn/document/server-docs/contact-v3/user/get) 查询 |
| `callback_path` | 回调路径（可选） | TMD 服务端路由，需在开发者后台配置相同地址 |

**飞书开发者后台额外配置**：

1. 创建企业自建应用 → 添加 **机器人** 能力
2. 权限管理 → 开启 `获取用户发给机器人的单聊消息` 权限
3. 事件订阅 → 添加 `接收消息 v2.0` 事件
4. 事件订阅 → 回调地址填写 `https://你的域名/api/v1/bot/feishu/callback`
5. 版本管理与发布 → 创建版本 → 审核发布

**可用命令**：`/dl [user|list|foll] <target> [opt=val ...]`、`/status <id>`、`/cancel <id>`、`/tasks`、`/help`
支持选项同 Telegram。

### Gotify（单向推送）

```yaml
gotify:
  server_url: "http://gotify.lan:8080"
  token: "S3cr3tT0k3n"
  priority: 5
```

| 参数 | 说明 | 获取方式 |
|---|---|---|
| `server_url` | Gotify 服务器地址 | 自行部署的 Gotify 服务端地址 |
| `token` | 应用 Token | Gotify Web UI → Apps → Create Application |
| `priority` | 通知优先级（可选，默认5） | Gotify 官方语义：2=Default, 5=High, 8=Emergency（bot.go 中未配置时回退 5）|

**触发场景**：任务完成/失败时推送标题和摘要；错误日志（error/fatal 级别）推送完整日志行（限速 1 条/秒）。

### Pushover（单向推送）

```yaml
pushover:
  user: "uKey123..."
  token: "appToken456..."
  device: "iphone"          # 可选
  sound: "gamelan"          # 可选
```

| 参数 | 说明 | 获取方式 |
|---|---|---|
| `user` | 用户 Key | [pushover.net](https://pushover.net) 登录后首页显示 |
| `token` | 应用 API Token | pushover.net → Create an Application/API Token |
| `device` | 指定设备名（可选） | Pushover App 中设置的设备名称 |
| `sound` | 通知声音（可选） | [可选值列表](https://pushover.net/api#sounds) |

**触发场景**：同 Gotify（限速 1 条/秒）。Pushover 免费版每月 7500 条配额，注意控制错误日志量。

---

## 多平台同时使用

可以同时启用多个平台，互不干扰：

```yaml
# bot_config.yaml
telegram:
  token: "..."
  allowed_users: [123456789]
discord:
  token: "..."
  allowed_users: ["123456789012345678"]
gotify:
  server_url: "http://gotify.lan:8080"
  token: "..."
```

所有开启了通知的平台都会收到任务完成通知。如果需要区分不同平台的通知内容，可以配置不同的参数（如 Pushover 的 `device` 和 `sound`）。

---

## 实现说明

### 包结构

```
internal/bot/
├── bot.go              # Bot 接口定义 + ParseDownloadOptions 工具函数
├── telegram/           # Telegram 实现
├── discord/            # Discord 实现
├── wechat/             # 微信 iLink 实现
├── feishu/             # 飞书/Lark 实现
├── gotify/             # Gotify 推送实现
└── pushover/           # Pushover 推送实现

internal/api/
└── bot_notify.go       # 共享通知基础设施：FormatTaskResult、RunBotEventLoop、RunBotLogLoop
```


### 双向 Bot vs 单向推送

**双向 Bot**（Telegram、Discord、WeChat、Feishu）：
- 接收用户消息 → 解析命令 → 创建/查询/取消任务 → 回复结果
- 订阅 EventBus → 任务完成后主动推送通知
- 依赖：`TaskManager` + `EventBus` + `LogHub` + `EnqueueTask`（注入的 `server.EnqueueTask`，与 HTTP API 同路径入队）

**单向推送**（Gotify、Pushover）：
- 仅订阅 EventBus + LogHub → HTTP POST 推送
- 不处理用户命令
- 依赖：`EventBus` + `LogHub`（无 `EnqueueTask`）

### 通知格式

任务结果通过 `api.FormatTaskResult(task, markdown)` 格式化。`markdown=true`（任务 ID 用反引号包裹）：Telegram/Discord/Gotify；`markdown=false`（纯文本）：WeChat/Feishu/Pushover。

```
✅ Task `task_abc123` completed
Downloaded: 10, Failed: 1

❌ Task `task_def456` failed
Error: something went wrong
```

### 日志告警推送

所有平台通过 `api.RunBotLogLoop` 接收日志，筛选以 `ERRO[` / `FATA[` 前缀开头的日志行（`isBotAlertLogLine`，bot_notify.go:70-73），以 1 条/秒速率限制发送：

- **Telegram/Discord**：遍历 `config.AllowedUsers`（配置静态列表）
- **WeChat**：遍历 `b.userTokens`（运行时收集的已交互用户）
- **Feishu**：遍历 `b.userChats`（运行时收集的已交互用户）
- **Gotify/Pushover**：推送到配置的服务器地址/用户

### 通信方式差异

| 平台 | 消息接收 | 命令模型 | Bot 身份 | 断线重连 |
|---|---|---|---|---|
| Telegram | 长轮询 `getUpdates`（60s timeout, `AllowedUpdates:["message"]`） | 文本命令 `/cmd` | 独立 Bot 账号 + Token | 库自动处理 |
| Discord | WebSocket Gateway（discordgo） | Slash Command 结构化 | 独立 Bot 账号 + Token | 库自动（Resume） |
| WeChat iLink | 长轮询 SDK（`Run` 阻塞 + `runWithReconnect` 外层） | 文本命令 `/cmd` | 个人微信号（QR 扫码登录） | 2min Login timeout + 30s 重试间隔 |
| 飞书/Lark | HTTP Webhook 回调（`NonBlockingCallback` + 10s 超时，feishu/bot.go `lark.WithTimeout`） | 文本命令 `/cmd` | 企业自建应用 + AppID/Secret | HTTP（被动） |
| Gotify | — | — | 应用 Token | — |
| Pushover | — | — | 应用 Token | — |

### 外部依赖

| 平台 | 依赖库 |
|---|---|
| Telegram | `github.com/go-telegram-bot-api/telegram-bot-api/v5` |
| Discord | `github.com/bwmarrin/discordgo` |
| WeChat iLink | `github.com/SpellingDragon/wechat-robot-go` |
| 飞书/Lark | `github.com/chyroc/lark` |
| Gotify | 无（标准库 `net/http`） |
| Pushover | 无（标准库 `net/http`） |

---

## 扩展新平台

添加新的 Bot 平台只需三步：

1. **创建实现包** `internal/bot/{name}/`，实现 `Bot` 接口
2. **添加配置** 在 `internal/config/config.go` 的 `BotConfig` 下加结构体即可（BotConfig 无 normalize/trim 逻辑，config.go:45-83 仅有纯结构体定义）
3. **注册到工厂** 在 `main.go` 的 `initBot()` 中加条件分支

如果平台使用 HTTP Webhook 回调（如飞书），还需要调用 `server.RegisterBotCallback(path, handler)` 注册路由。

---

## 普通用户配置指南

以下内容面向不想看源码、只想让 Bot 跑起来的普通用户。

### 前提

1. TMD 以 **Server 模式** 运行（启动时加 `-server` 参数，或 Docker 部署）
2. 首次启动后，配置文件 `bot_config.yaml` 会自动生成在 TMD 数据目录下（通常为 `~/.tmd2/bot_config.yaml` 或 `%APPDATA%\.tmd2\bot_config.yaml`）
3. 用文本编辑器打开 `bot_config.yaml`，去掉想用的平台前面的 `#` 注释，填好参数，保存后**重启 TMD** 生效

> **提示**：所有平台可以同时启用，互不干扰。不需要的平台保持注释状态即可。

### 官方文档参考

| 平台 | 接入文档 / 入口 |
|------|----------------|
| Telegram | https://core.telegram.org/bots/api |
|  | @BotFather 创建 Bot → 拿 Token |
| Discord | https://discord.com/developers/applications |
|  | https://discord.com/developers/docs/intro |
| Feishu/Lark | https://open.feishu.cn/app |
|  | https://open.feishu.cn/document |
| Gotify | https://gotify.net/docs/ |
|  | https://github.com/gotify/server |
| Pushover | https://pushover.net |
|  | https://pushover.net/api |
| WeChat iLink | 无官方文档（SDK: `github.com/SpellingDragon/wechat-robot-go`） |


---

### Telegram 配置步骤

1. 打开 Telegram，搜索 `@BotFather`，发送 `/newbot`
2. 按提示输入 Bot 名称和用户名，BotFather 会给你一个 `token`（格式如 `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`）
3. 向你的新 Bot 随便发一条消息（比如 `/start`）
4. 浏览器打开 `https://api.telegram.org/bot<你的token>/getUpdates`，找到 `"from":{"id":123456789,...}` 这串数字就是你的 `allowed_users`
5. 编辑 `bot_config.yaml`，填入：

```yaml
telegram:
  token: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  allowed_users: [123456789]
```

6. 重启 TMD，向 Bot 发 `/help` 查看可用命令

---

### Discord 配置步骤

1. 打开 https://discord.com/developers/applications ，点击 New Application
2. 左侧 Bot → Reset Token → 复制 token
3. 左侧 OAuth2 → URL Generator → 勾选 `bot` → 勾选 `Send Messages`、`Use Slash Commands`
4. 复制生成的 URL，浏览器打开，选择服务器添加 Bot
5. Discord 设置 → 高级 → 开发者模式 → 开启
6. 右键你的用户名 → Copy ID（这就是你的 `allowed_users`）
7. 编辑 `bot_config.yaml`：

```yaml
discord:
  token: "MTE5ODk4MjQ2NzE4NTMyMTI5OQ.GnO2X.xxx"
  allowed_users: ["123456789012345678"]
```

8. 重启 TMD，在 Discord 服务器中输入 `/help` 查看可用命令

---

### WeChat iLink 配置步骤

> WeChat iLink 使用个人微信号作为 Bot 登录。

1. 编辑 `bot_config.yaml`：

```yaml
wechat:
  credential_path: ".weixin-token.json"
  allowed_users: []
```

2. 重启 TMD，查看服务端日志（控制台或 `tmd2.log`），会输出一个 QR Code URL
3. 用微信扫描二维码（**只能在微信中打开该 URL**，复制到浏览器无效）
4. 扫码后 Bot 自动登录，后续重启会自动复用凭证，无需重复扫码
5. 想限制谁能使用 Bot？`allowed_users` 留空即允许所有用户（当前版本不打印 `FromUserID`，无法从日志获取）：

```yaml
  allowed_users: ["wxid_xxxxxxx@im.wechat"]
```

---

### 飞书 / Lark 配置步骤

1. 打开 https://open.feishu.cn/app ，创建企业自建应用
2. 应用名称随便填，创建后进入应用
3. **凭证与基础信息**：记下 `App ID` 和 `App Secret`
4. **添加应用能力** → 开启 **机器人**
5. **事件与回调** → 添加事件 `接收消息 v2.0`
6. **事件与回调** → 回调地址填写 `https://你的域名/api/v1/bot/feishu/callback`（如无域名可使用内网穿透工具如 ngrok）
7. **权限管理** → 开启 `获取用户发给机器人的单聊消息`
8. **版本管理与发布** → 创建版本 → 审核发布（需要企业管理员审批）
9. 编辑 `bot_config.yaml`：

```yaml
feishu:
  app_id: "cli_xxxxxxxxxxxx"
  app_secret: "xxxxxxxxxxxxxxxxxxxxxxxxxx"
  verify_token: "xxxxxxxxxxxx"
  allowed_users: ["ou_xxxxxxxxxxxxx"]
```

10. `allowed_users`（用户 open_id）的获取方式：留空即允许所有用户，或通过[飞书开放平台 API](https://open.feishu.cn/document/server-docs/contact-v3/user/get) 查询（当前版本不打印 openID，feishu/handlers.go 仅用于权限校验）
11. 重启 TMD

---

### Gotify 配置步骤（单向推送）

1. 部署 Gotify 服务器（参考 https://github.com/gotify/server ），或已有现成的
2. Gotify Web UI → Apps → Create Application → 记下 Token
3. 编辑 `bot_config.yaml`：

```yaml
gotify:
  server_url: "http://你的gotify地址:8080"
  token: "S3cr3tT0k3n"
  priority: 5
```

4. 重启 TMD，任务完成/失败时会自动推送通知

---

### Pushover 配置步骤（单向推送）

1. 注册 https://pushover.net ，记下首页的 **User Key**
2. 登录后 Create an Application/API Token，记下 **API Token**
3. 编辑 `bot_config.yaml`：

```yaml
pushover:
  user: "uKey123..."
  token: "appToken456..."
```

4. （可选）如果有多台设备，想指定接收通知的设备：在 Pushover App 中设置设备名，填入 `device: "iphone"`；想换提示音：填入 `sound: "gamelan"`（可选值见 https://pushover.net/api#sounds）
5. 重启 TMD

---

### Docker 部署特别说明

如果 TMD 运行在 Docker 容器中：

```bash
# 挂载配置目录到宿主机，bot_config.yaml 会自动生成在那里
docker run -d \
  --name tmd \
  -p 25556:25556 \
  -v /path/to/config:/config \
  -e TMD_HOME=/config \
  leeexx00/tmdp:latest -server

# 编辑宿主机上的配置文件
vi /path/to/config/bot_config.yaml

# 重启容器
docker restart tmd
```

> **注意**：飞书/Lark 的回调地址必须从外部可访问，Docker 部署时需要配置反向代理（如 Nginx）或内网穿透。其余平台不受影响。

### 验证配置是否生效

配置完成后重启 TMD，在控制台或 `tmd2.log` 中查找以下日志：

```
[bot-telegram] Started account=<BotUsername>          # telegram/bot.go:53
[bot-discord] Started account=<BotUsername>           # discord/bot.go:58
[bot-wechat] Starting credential_path=".weixin-token.json"   # wechat/bot.go:83
[bot-feishu] Started app_id=cli_xxxxxxxxxxxx callback_path=/api/v1/bot/feishu/callback   # feishu/bot.go:76
[bot-gotify] Started server=http://gotify.lan:8080    # gotify/bot.go:50
[bot-pushover] Started device="iphone" sound="gamelan"  # pushover/bot.go:48
[bot] Started provider=telegram                       # server.go:315
[bot] Stopped provider=telegram                       # server.go:439（GracefulShutdown 时）
```

不存在的平台不会有日志。启动后向 Bot 发送 `/help`，返回帮助信息说明 Bot 正常工作。

### Discord 特别说明

Discord Slash Command 注册为**全局命令**，更新后最长需要 **1 小时**才能在所有服务器生效。
如需即时测试，可将 `ApplicationCommandCreate` 的第二个参数改为你的服务器 ID（开发者可见），命令会立刻注册到该服务器。

### 安全提示

- **`allowed_users` 是唯一的访问控制**：Bot 对所有未授权的用户回复 `⛔ Unauthorized`。留空时允许所有用户使用。
- **凭据保护**：`bot_config.yaml` 中的 token、secret、user key 等不应提交到 Git 或分享给他人。
- **API Key 配合使用**：Bot 接口通过 Server 的 API Key 认证保护（如果已启用），详见 `conf.yaml` 的 `api_key` 字段。
- **WeChat 扫码安全**：QR Code 仅限首次登录使用，凭证自动保存到 `credential_path`，请确保该文件不被泄露。
