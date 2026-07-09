# Service Layer

The `DownloadService` interface in `internal/service/interfaces.go` defines 11 operations that both CLI and API Server call. The implementation `DownloadServiceImpl` delegates to [[download-pipeline]] for orchestration.

## Operations

Each method in the interface maps to a distinct download or maintenance operation.

| Operation | Purpose |
|-----------|---------|
| `UserDownload` | Download one user's timeline media |
| `ListDownload` | Download a Twitter List's media |
| `FollowingDownload` | Download media from a target's followings |
| `ProfileDownload` | Download avatar/banner/profile.json for users |
| `ListProfileDownload` | Download profiles for all List members |
| `MarkDownloaded` | Set `latest_release_time` to skip past tweets |
| `JsonFileDownload` | Import from third-party JSON export |
| `JsonFolderDownload` | Import from `.loongtweet/` folders |
| `BatchDownload` | Mixed multi-user/list/following download |
| `RetryAllFailed` | Retry all failures from errors.json |
| `ClearErrors` | Clear all error records |

## CLI vs Server Path

CLI calls service methods directly with [[architecture|LogReporter]]. Server creates a [[task-management|Task]] via `TaskManager.CreateTask()`, queues it in [[task-management|DownloadQueue]], which executes the service method with an `SSEProgressReporter`.

## Key Dependencies

The `DownloadServiceImpl` struct holds references to the infrastructure layer, injected via `Dependencies`.

- **`s.deps.Client`** — master Twitter account client
- **`s.deps.AdditionalClients`** — secondary accounts for rate limit distribution
- **`s.deps.DB`** — database instance
- **`s.deps.Config`** — application config
- **`s.deps.ListSyncManager`** — list membership sync

## Thread Safety

A `dumperMu sync.Mutex` in `DownloadServiceImpl` protects concurrent access to the [[download-pipeline|TweetDumper]] (failure recorder) from multiple download tasks.
