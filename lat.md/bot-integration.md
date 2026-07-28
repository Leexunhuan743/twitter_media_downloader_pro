# Bot Integration

TMD supports six bot platforms for receiving download notifications and sending commands. Each platform implements the `Bot` interface in `internal/bot/bot.go`.

## Bot Interface

Every platform implements `Start()` (non-blocking, goroutine-based event loop), `Stop()` (graceful shutdown via `sync.WaitGroup`), and `Name()` (log prefix).

```
Start() → goroutine: handleEvents / handleLogs
Stop()  → cancel context → wg.Wait()
```

- **handleEvents**: command parsing, task creation, direct replies
- **handleLogs**: optional, subscribes to LogHub for server-wide log streaming
- Tasks track per-chat ownership via `chatTasks map` — only the requesting chat receives completion notifications


Six platforms are supported, each in its own package.

## Platforms

Telegram and Discord use native APIs; WeChat and Feishu use third-party client libraries; Gotify and PushOver are notification-only.

| **Telegram** | `internal/bot/telegram/` | Long-polling (go-telegram) | Text `/dl`, `/cancel` | Per-chat | `Message.From` may be nil in channels; `SenderChat` fallback needed |
| **Discord** | `internal/bot/discord/` | Gateway (discordgo) | Slash commands | Per-chat | Native boolean options for `/dl` |
| **WeChat** | `internal/bot/wechat/` | IPC (wechat-robot-go) | Text commands | Per-chat | QR code login, blocking start |
| **Feishu** | `internal/bot/feishu/` | Webhook (lark-go) | Text commands | Per-user | Log alerts broadcast to all active chats; task notifications per-user |
| **Gotify** | `internal/bot/gotify/` | Push (Gotify API) | N/A (push only) | Broadcast | No command support, push-only |
| **PushOver** | `internal/bot/pushover/` | Push (PushOver API) | N/A (push only) | Broadcast | No command support, push-only |

## Notification Flow

Notification helpers live in `internal/api/bot_notify.go` (avoids bot→api import cycle):

```
Task complete → api.EventBus → RunBotEventLoop(chatID, task, botName)
                    ↓
            FormatTaskResult(task) → formatted message
                    ↓
            bot.SendText(chatID, message)
```

- `RunBotEventLoop` — subscribes to EventBus, sends task completion to the requesting chat
- `RunBotLogLoop` — subscribes to LogHub, streams logs to a chat
- `FormatTaskResult` — formats task result into a human-readable message (task type, status, media count, duration)

## DownloadOptions

Parsed from command arguments and mapped to task data fields.

Shared text parsing in `internal/bot/bot.go#ParseDownloadOptions()`:
```
/dl elonmusk auto_follow=true skip_profile=true
→ ScreenName: "elonmusk", AutoFollow: true, SkipProfile: true
```

| Option | Short | Field | Affected Task Types |
|--------|-------|-------|---------------------|
| `auto_follow` | `af` | `AutoFollow` | UserDownload, FollowingDownload, ListDownload, BatchDownload |
| `follow_members` | `fm` | `FollowMembers` | ListDownload, FollowingDownload |
| `skip_profile` | `sp` | `SkipProfile` | UserDownload, FollowingDownload, ListDownload, BatchDownload |
| `no_retry` | `nr` | `NoRetry` | JsonFileDownload, JsonFolderDownload |

- Text-based bots (Telegram, WeChat, Feishu): `ParseDownloadOptions()` strips options from raw args, returns clean remainder for standard arg parsing
- Discord: uses native `ApplicationCommandOptionBoolean` slash-command options

## Command Pattern

All command-capable bots support `/dl` (download) and `/cancel` (cancel task):

- **cmdDownload**: parse args → create task via `api.Server.CreateTask` → reply with task_id
- **cmdCancel**: lookup task by target → cancel via `TaskManager.CancelTask`
- Help is returned on unrecognized commands

## Lifecycle (main.go)

Bot lifecycle logs identify startup and delivery failures for each provider without logging secrets.

```
config → init bots → server.Start() → for each bot: go bot.Start()
                                        ↓
                              sigint/sigterm → server.GracefulShutdown
                                        ↓
                              for each bot: bot.Stop()
```

Bots are initialized in `main.go` after the server starts. Each bot runs in its own goroutine. On shutdown, bots stop before the server drains its task queue.

Provider logs use `[bot-telegram]`, `[bot-discord]`, `[bot-wechat]`, `[bot-feishu]`, `[bot-gotify]`, or `[bot-pushover]`. Startup messages may include account or endpoint summaries, while token, secret, and webhook credentials are never logged.

### Bot HTTP Callback Routes

Feishu registers an HTTP callback for interactive message handling:

- `POST /api/v1/bot/feishu/callback` — Feishu event callback (configurable via `feishu.callback_path`)

Other platforms use long-polling or WebSocket and do not need HTTP callbacks.
