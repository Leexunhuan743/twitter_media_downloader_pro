# Architecture

TMD (Twitter Media Downloader) is a Go application that downloads media from Twitter/X. It supports both CLI and API Server modes, sharing a common service layer.

## Layered Structure

The codebase is organized into vertical layers, each with a single responsibility. Data flows from top (entry points) to bottom (filesystem).

```
main.go → CLI / API Server → service → downloading → downloader
                                                        ↓
                                              fileWriter / naming / path
```

- **main.go** — entry point: config, login, DB init, mode dispatch
- **CLI** (`internal/cli`) — synchronous, progress via LogReporter
- **API Server** (`internal/api`) — async tasks, SSE push, Web UI
- **Service** (`internal/service`) — [[service-layer|DownloadService]] interface, 11 operations
- **Downloading** (`internal/downloading`) — batch orchestration, producer-consumer
- **Downloader** (`internal/downloader`) — single-file download + atomic write
- **Twitter** (`internal/twitter`) — GraphQL API, multi-account, rate limiting
- **Database** (`internal/database`) — SQLite, 6 tables, WAL mode
- **Entity** (`internal/entity`) — [[database|UserEntity]] path + lifecycle management
- **Naming** (`internal/naming`) — file/dir naming rules, uniqueness
- **Path** (`internal/path`) — store root paths, error file locations

## Two Execution Modes

The application runs in one of two modes, selected at startup. The table below highlights operational differences.

| Aspect | CLI Mode | Server Mode |
|--------|----------|-------------|
| Execution | Synchronous, blocks until done | Async, returns task_id immediately |
| Progress | LogReporter → logs | SSEProgressReporter → EventBus → Web UI |
| Signal handling | context cancel | GracefulShutdown |
| Resource cleanup | defer db.Close() | GracefulShutdown unified |
| Client log | O_TRUNC (reset per run) | O_APPEND (grows unbounded) |

## Data Directory

Two root directories store the application's data: the app root (config, logs) and the download root (media, DB).

```
{appRootPath} (~/.tmd2 or %APPDATA%\.tmd2)
├── conf.yaml              # main config
├── additional_cookies.yaml
├── tmd2.log               # rotated via lumberjack
├── client.log             # resty HTTP log (⚠ no rotation in server mode)
└── schedules.yaml

{rootPath} (download root)
├── users/{screen_name}/   # per-user media
│   └── .loongtweet/       # tweet metadata JSON/TXT
└── .data/
    ├── foo.db             # SQLite
    ├── errors.json
    └── json_errors.json
```

## Key Design Decisions

Architectural choices that constrain how the system behaves and evolves.

- **CGO_ENABLED=0** — pure Go SQLite via `modernc.org/sqlite`
- **Single DB connection** — max 1 open connection, WAL mode
- **Custom task queue** — [[task-management|DownloadQueue]] with sync.Cond, target lock (same user → serial)
- **Producer-consumer download** — ants.Pool (producers) + goroutine pool (consumers), per-user tweet buffer
- **Atomic file writes** — temp file → os.Rename for crash safety
- **Multi-account** — [[twitter-api|selectClientMFQ]] rotates across accounts for rate limit distribution
