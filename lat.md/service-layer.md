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
- **`s.deps.ListSyncManager`** — list membership sync
- **`s.deps.AppRootPath`** — app root path for JSON download path validation

## Thread Safety

A `dumperMu sync.Mutex` in `DownloadServiceImpl` protects concurrent access to the [[download-pipeline|TweetDumper]] (failure recorder) from multiple download tasks.

## Download Options

Four boolean options control download behavior. They are set per-task via JSON body (API) or command arguments ([[bot-integration|bot platforms]]).

The canonical `DownloadOptions` struct is defined in `service/interfaces.go` (lines 8-13). The API layer's task data structs in `api/types.go` (e.g. `UserDownloadTaskData`) carry equivalent JSON-tagged fields — they are mapped into `DownloadOptions` at service call time.

| Option | Effect |
|--------|--------|
| `AutoFollow` | Automatically follow protected users before downloading their media. Requires master account. |
| `FollowMembers` | After a list download, follow all list members whose media was downloaded. Requires master account. |
| `SkipProfile` | Skip the avatar/banner/profile.json download that normally follows media download. |
| `NoRetry` | Skip the automatic retry of failed items after the download round completes. |

Available on `UserDownload`, `FollowingDownload`, `ListDownload`, and `BatchDownload` operations. `JsonFileDownload` and `JsonFolderDownload` support only `NoRetry`.
