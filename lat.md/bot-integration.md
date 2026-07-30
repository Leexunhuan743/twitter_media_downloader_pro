# Bot Integration

TMDP can attach optional bot providers to server mode for remote commands and task/error notifications; the feature is locally tested but not live-tested against real provider accounts.

## Runtime Attachment

Bots are created only in server mode after `bot_config.yaml` is loaded from the app root and before `Server.Start` begins listening.

`main.go` checks each provider config for its required credential fields, constructs enabled bots with server-owned services, and passes them into `server.InitBot`. Feishu also registers its HTTP callback route before the server handler is built.

Command-capable providers receive `TaskManager`, `EventBus`, `LogHub`, and `server.EnqueueTask`. Push-only providers receive `EventBus` and `LogHub`.

## Provider Matrix

Each provider implements `internal/bot.Bot`, but command support, ownership, and transport differ by package.

| Provider | Package | Transport | Commands | Notification Scope | Notes |
|----------|---------|-----------|----------|--------------------|-------|
| Telegram | `internal/bot/telegram` | Telegram long polling | `/dl`, `/status`, `/cancel`, `/tasks`, `/help` | Per chat for requested tasks; log alerts to allowed users | Messages without `From` are ignored for authorization safety. |
| Discord | `internal/bot/discord` | discordgo Gateway and global slash commands | `/dl`, `/status`, `/cancel`, `/tasks`, `/help` | Per channel for requested tasks; log alerts by DM to allowed users | `/dl` uses native boolean slash options. |
| WeChat | `internal/bot/wechat` | wechat-robot-go iLink login and reconnect loop | `/dl`, `/status`, `/cancel`, `/tasks`, `/help` | Per WeChat user for requested tasks; log alerts to users seen in this run | Requires QR/login credentials and is the least locally verifiable provider. |
| Feishu | `internal/bot/feishu` | Lark callback endpoint | `/dl`, `/status`, `/cancel`, `/tasks`, `/help` | Per open ID for requested tasks; log alerts to chats seen in this run | Callback path defaults to `/api/v1/bot/feishu/callback`. |
| Gotify | `internal/bot/gotify` | Gotify HTTP push API | none | Broadcasts each terminal task once; error log alerts | Requires `server_url` and app token. |
| Pushover | `internal/bot/pushover` | Pushover HTTP API | none | Broadcasts each terminal task once; error log alerts | Requires user key and app token. |

## Command Flow

Command bots now use the same queue-backed execution path as HTTP and scheduled downloads.

```
provider command
→ TaskManager.CreateTask
→ Server.EnqueueTask
→ buildTaskRunFunc
→ DownloadQueue.Enqueue
→ DownloadService operation
→ TaskManager/EventBus updates
→ provider task notification
```

The key invariant is that creating a task is not enough. Any command that starts work must call `Server.EnqueueTask`, otherwise the task will remain queued forever.

`/cancel` must call `TaskManager.CancelTask` so task status, context cancellation, EventBus updates, and logs stay consistent. Calling only `task.Cancel()` cancels the context without updating task state.

## Download Commands

Remote download commands intentionally expose a smaller surface than the full HTTP API.

Command-capable bots support user, list, and following downloads:

```
/dl elonmusk
/dl user elonmusk
/dl list 12345
/dl foll elonmusk auto_follow=true skip_profile=true
```

They do not currently expose JSON import, mark-downloaded, retry-all, profile-only, or batch-mixed commands. Those remain HTTP/Web/CLI features.

## Download Options

Text command options are parsed from trailing `key=value` tokens by `internal/bot.ParseDownloadOptions`.

| Option | Short | Field | Applies To |
|--------|-------|-------|------------|
| `auto_follow` | `af` | `AutoFollow` | user, list, following |
| `follow_members` | `fm` | `FollowMembers` | list, following |
| `skip_profile` | `sp` | `SkipProfile` | user, list, following |
| `no_retry` | `nr` | `NoRetry` | user, list, following |

Only known keys with `true` or `false` values are stripped from the command tail. Unknown `key=true` tokens stay in the remaining target text instead of being silently discarded.

Discord does not use text parsing for these options; it registers boolean slash-command options and maps them directly into task data.

## Notification Flow

Task and error notifications reuse server event streams rather than provider-specific polling.

`api.RunBotEventLoop` subscribes to `EventBus` and handles `tasks` events. Command providers keep a local task ownership map and only notify the chat/user/channel that started the task. Gotify and Pushover are broadcast providers, so they keep a local sent-task map to avoid repeating terminal-task notifications on later task snapshots.

`api.RunBotLogLoop` subscribes to `LogHub`, filters only `ERRO` and `FATA` log lines, and rate-limits alerts to at most one line per second per provider loop. It is an error-alert path, not a full live log stream.

`api.FormatTaskResult` formats completed or failed task summaries with status, task ID, main downloaded/failed counts when available, and the task error when present.

## Feishu Callback

Feishu is the only provider that needs an HTTP callback route registered in the API server.

`main.go` registers `feishuBot.CallbackHandler()` at `feishu.callback_path` or `/api/v1/bot/feishu/callback`. The handler is a stable closure, so it can be registered before `Start`; if a callback arrives before the Lark client is initialized, it returns `503` instead of panicking.

## Shutdown

Server graceful shutdown owns bot stopping after task cancellation, queue draining, and scheduler stop have started.

Each provider implements `Stop()` by closing its stop channel and waiting for provider goroutines. Discord also closes the Gateway session; WeChat cancels its login/run context; Telegram stops receiving updates after its goroutine exits.

The server `shutdownOnce` prevents normal graceful shutdown from stopping a provider twice. Individual provider `Stop()` methods are not currently idempotent when called directly multiple times.

## Local Validation Boundary

Local tests cover parsing, authorization helpers, task-result formatting, Feishu pre-start callback behavior, Gotify duplicate suppression, bot package compilation, and API queue execution.

They do not prove real-provider acceptance for Telegram long polling, Discord command registration, WeChat QR/iLink login, Feishu event verification, Gotify delivery, or Pushover delivery. Those require live credentials and platform-side callback or gateway testing.

## Security Notes

Bot credentials are loaded from `bot_config.yaml`; startup logs should identify providers without printing tokens, secrets, verify tokens, or encrypt keys.

Allowed-user lists are optional. Empty lists mean the provider accepts commands from any user recognized by that provider, which is convenient for local testing but risky for public bots.
