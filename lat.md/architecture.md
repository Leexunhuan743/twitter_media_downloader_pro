# Architecture

TMDP is a Go Twitter/X media downloader with one shared download core and two runtime faces: CLI execution and an embedded API/Web server.

## Runtime Shape

The process starts in `main.go`, resolves config/log/data paths, signs in to Twitter/X, opens SQLite, then dispatches into CLI or server mode.

```
main.go
├─ config/log/db/twitter bootstrap
├─ CLI mode ───────────────→ [[service-layer|DownloadService]] ─→ [[download-pipeline|download pipeline]]
└─ Server mode
   ├─ [[api-server|API/Web server]]
   ├─ [[task-management|TaskManager + DownloadQueue]]
   ├─ [[scheduler|Scheduler]]
   ├─ EventBus/SSE/log stream
   └─ [[service-layer|DownloadService]] ─→ [[download-pipeline|download pipeline]]
```

`parseBootstrapArgs` owns only process-level flags such as `-server`, `-port`, `-conf`, and `-dbg`. All download-operation flags are passed through to [[cli-runtime]].

## Layer Boundaries

The repository is organized around control surfaces, a shared service layer, download orchestration, persistence, and external integrations.

- `main.go` bootstraps config, log writers, Twitter clients, the store path, and the database connection.
- `internal/cli` parses CLI download flags and executes selected operations synchronously through `DownloadService`.
- `internal/api` owns HTTP routing, auth, Web UI assets, task state, queueing, SSE, log streaming, config handlers, DB handlers, and graceful shutdown.
- `internal/service` exposes `DownloadService`; CLI, API, scheduler triggers, and bots all converge here instead of duplicating download logic.
- `internal/downloading` coordinates user/list/following/media/profile workflows and calls lower-level download helpers.
- `internal/downloader` performs individual media HTTP downloads, retry-aware logging, temp-file writes, and atomic rename.
- `internal/twitter` wraps Twitter/X GraphQL calls, multi-account login, request counting, and rate-limit handling.
- `internal/database` owns SQLite schema creation, migration, validation, and query helpers.
- `internal/entity`, `internal/naming`, and `internal/path` keep filesystem layout, display names, unique filenames, and error-file locations consistent.
- `internal/bot` and provider packages attach external notification/control channels to server-owned task and event services.

## Execution Modes

CLI and server modes intentionally share dependencies but differ in control flow, progress transport, and shutdown semantics.

| Aspect | CLI Mode | Server Mode |
|--------|----------|-------------|
| Selection | `internal/cli.ParseArgs` chooses one primary operation group | HTTP handlers or scheduler create typed tasks |
| Execution | Runs synchronously and returns process success/failure | Enqueues work and returns `task_id` immediately |
| Progress | `service.NewLogReporter` writes CLI logs | `SSEProgressReporter` updates TaskManager and EventBus |
| Lifetime | Signal cancels the root context; `db.Close()` is deferred | `GracefulShutdown` stops HTTP, scheduler, queue, bots, EventBus/log hub, and DB |
| Web UI | Not started | Embedded `web1`/`web2` assets are served by `internal/api` |

The shared service boundary is important: changing download behavior should usually happen below `internal/service`, while changing task/API/UI behavior should stay in `internal/api`.

## Server Control Plane

Server mode is the long-running control plane around the same download service, not a second downloader implementation.

`api.NewServerWithConsoleLogHub` creates one `EventBus`, one `TaskManager`, one `DownloadService`, one `DownloadQueue`, and optionally a `Scheduler` from `{appRootPath}/schedules.yaml`. HTTP handlers create tasks, build a service run function, and enqueue it with `DownloadQueue`.

The server also owns the Web UI. `internal/api/handlers.go` embeds `internal/api/web/*`, defaults to `web1`, can switch to `web2`, and uses local files in `TMD_DEV=1` development mode.

## Task And Event Flow

API work moves through task state before it reaches the shared service, which keeps Web UI progress, cancellation, and logs aligned.

```
HTTP handler / scheduler / bot
→ TaskManager.CreateTask
→ DownloadQueue.Enqueue
→ TaskManager running state
→ DownloadService operation
→ ProgressReporter updates
→ TaskManager result + EventBus publish
→ SSE/Web UI/log consumers
```

`DownloadQueue` keeps a pending list, a target-lock map, and detached runs. It skips cancelled/non-queued jobs, avoids conflicting target execution, and releases target locks when a task finishes or is detached after cancellation grace.

`EventBus` coalesces high-frequency `tasks` and `schedules` events, while replaying durable notification-style events such as `notification` and `server_shutdown`. This keeps the Web UI responsive without flooding SSE clients.

## Scheduler Role

The scheduler is a server-mode trigger source that creates normal download tasks; it does not bypass the API task system.

`internal/scheduler` loads interval/daily entries from `{appRootPath}/schedules.yaml`, validates them, starts one loop per enabled entry, records status, and calls the server-provided `scheduledDownload` callback. Manual schedule triggers use the same task creation path.

## Data Directories

The app root stores configuration and runtime logs; the download root stores media, metadata, error files, and SQLite data.

```
{appRootPath} = TMD_HOME or (%APPDATA%/.tmd2 on Windows, $HOME/.tmd2 on Unix-like systems)
├── conf.yaml
├── additional_cookies.yaml
├── bot_config.yaml
├── schedules.yaml
├── tmd2.log
└── client.log

{rootPath} = config.RootPath
├── users/{screen_name}/
│   └── .loongtweet/
└── .data/
    ├── foo.db
    ├── errors.json
    └── json_errors.json
```

`main.go` resolves the app root, while `internal/path.NewStorePath` derives download-root paths. `database.Connect` opens `{rootPath}/.data/foo.db`, creates tables, applies migrations, and validates the schema.

## Persistence Model

SQLite stores normalized user/list/entity/link state; media and tweet metadata stay on disk under the download root.

The core tables are documented in [[database]]. The architecture-level rule is that DB rows describe known users, lists, entity folders, links, accessibility, and historical names; downloaded media files remain filesystem artifacts.

## Key Design Decisions

These choices explain why the project is structured this way.

- CLI, API, scheduler, and bot entrypoints all call `DownloadService`; there should be one authoritative download behavior.
- API tasks are long-running server work, so they require explicit state (`TaskManager`), queueing (`DownloadQueue`), and streamed progress (`EventBus`/SSE).
- Same-target downloads are serialized by queue target locks to avoid racing filesystem paths and DB/entity state.
- Downloaded files use temp-file writes followed by rename, keeping partial media out of final paths.
- The app root and download root are intentionally separate so config/logs can live in the user profile while large media lives in `RootPath`.
- The Web UI is embedded into the Go binary for release builds, with `TMD_DEV=1` allowing local frontend iteration.
- SQLite uses the pure-Go driver path documented in [[database]], so release binaries can build with `CGO_ENABLED=0`.
