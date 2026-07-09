# Task Management

The API server uses an async task system to handle download requests. Tasks are queued, executed in order, and broadcast progress via SSE.

## Task Types

Ten distinct task types cover all download and maintenance operations.

| Type | Description |
|------|-------------|
| `user_download` | Download all media from a user's timeline |
| `list_download` | Download media from a Twitter List |
| `following_download` | Download media from users a target follows |
| `profile_download` | Download avatar/banner/profile.json |
| `list_profile` | Download profiles of List members |
| `mark_downloaded` | Mark users/lists/following as already downloaded |
| `json_file_download` | Import from third-party JSON export |
| `json_folder_download` | Import from `.loongtweet/` JSON folder |
| `batch_download` | Mixed multi-user/list/following download |
| `retry_all_failed` | Retry all previously failed items |

## State Machine

```
queued → running → completed
                → failed
                → cancelled
```

Terminal states are irreversible. Tasks older than 24h are cleaned by a background goroutine.

## TaskManager

In-memory task store with RWMutex protection. Responsible for lifecycle, cancellation, and event broadcasting.

- In-memory map `map[string]*Task`, RWMutex protected
- Each task holds its own `context.Context` + `CancelFunc`
- Task IDs are `task_<uuid>` format, monotonically increasing by creation time
- State changes → snapshot rebuild → EventBus broadcast

## DownloadQueue

Producer-consumer queue backed by `sync.Cond`. Ensures only one task runs per target at a time.

- **Target lock**: same scope+value (e.g. user "elonmusk") cannot run concurrently
- **Detached mode**: cancelled tasks get 10s grace period, then continue as detached (no status updates)
- **Shutdown**: waits up to 15s for all workers to finish
- **Worker loop**: single goroutine dequeues one task at a time

## EventBus / SSE

Publish/subscribe system for real-time event delivery to Web UI and bots.

- Publish/subscribe pattern
- **Coalesced events**: `tasks`, `schedules` — last value only, for polling
- **Replayable events**: `notification`, `server_shutdown` — ring buffer (max 256), replayed on reconnect
- **Pre-serialized**: shared JSON byte cache per event, all subscribers get the same blob
- **Slow consumer protection**: queue > 4096 → auto-close subscriber
- Heartbeat: 25s, write timeout: 10s
