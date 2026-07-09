# API Server

HTTP server on port 25556 (configurable via `-port` or `TMD_PORT`). Provides REST API + embedded Web UI + SSE push for real-time task updates.

## Router

Uses Go 1.22+ `mux.HandleFunc("METHOD /path", handler)` pattern in `buildHandler()`. Middleware stack (outermost first):

1. CORS
2. AuthMiddleware (optional, configured via `api_key`)
3. ServeMux

## AuthMiddleware

Optional bearer-token authentication layer. When the API key is empty, auth is disabled for backward compatibility.

- Configured via `conf.yaml` → `api_key` field or `TMD_API_KEY` env var
- Empty key → auth disabled (backward compatible)
- `Authorization: Bearer <token>` header (primary), `?token=` query param fallback for SSE
- Public whitelist: health check, theme config, Web UI pages, static files
- 401 response: `{"success":false,"error":"unauthorized"}` + `WWW-Authenticate: Bearer`

## API Routes

All download endpoints return `202 Accepted` with `task_id`. Task progress is pushed via [[task-management|SSE]].

### Core Download Endpoints

Endpoints for initiating downloads against users, lists, and JSON imports.

```
POST /api/v1/users/{screen_name}/download
POST /api/v1/users/{screen_name}/profile
POST /api/v1/users/{screen_name}/mark
POST /api/v1/users/{screen_name}/following/download
POST /api/v1/users/{screen_name}/following/mark
POST /api/v1/lists/{list_id}/download
POST /api/v1/lists/{list_id}/profile
POST /api/v1/lists/{list_id}/mark
POST /api/v1/json/file/download
POST /api/v1/json/folder/download
POST /api/v1/batch/download
POST /api/v1/batch/mark
```

### Task Management

Endpoints to inspect, cancel, and retry queued or running tasks.

```
GET    /api/v1/tasks
GET    /api/v1/tasks/stats
GET    /api/v1/tasks/{task_id}
POST   /api/v1/tasks/{task_id}/cancel
POST   /api/v1/tasks/cancel-queued
POST   /api/v1/tasks/{task_id}/retry
DELETE /api/v1/tasks/{task_id}
```

### System

Infrastructure endpoints for health checks and server lifecycle.

```
GET  /api/v1/health
GET  /api/v1/queue/status
POST /api/v1/server/shutdown
GET  /api/v1/sse/tasks
```

### Config, Cookies, Schedules, Logs, DB Management

Endpoints for all remaining management and configuration operations.

```
GET/PUT  /api/v1/config, /api/v1/config/raw, /api/v1/config/fields
GET/PUT  /api/v1/cookies, /api/v1/cookies/raw
GET/PUT  /api/v1/schedules, /api/v1/schedules/raw
GET      /api/v1/logs, /api/v1/logs/export, /api/v1/logs/stream
GET/PATCH/DELETE /api/v1/db/users/{id}, /api/v1/db/lists/{id}, etc.
```

## Web UI

Two independent frontend themes in `internal/api/web/`:

```
internal/api/web/
├── web1/          # Classic theme
│   ├── index.html
│   ├── app.js     (~204KB)
│   └── styles.css (~40KB)
└── web2/          # New streamlined theme
    ├── index.html
    ├── app.js     (~104KB)
    ├── styles.css (~20KB)
    └── favicon.svg
```

- **No build step** — pure HTML/CSS/JS, embedded via Go `//go:embed`
- **Runtime hot-switch** — `GET/POST /api/v1/config/theme` + `GET /api/v1/config/themes`
- **Theme switcher** — floating 🎨 button injected by Go handler (`themeSwitcherHTML()`)
- **Security** — validates target directory exists and contains index.html
- **Shared backend** — both themes call same REST API + EventSource SSE

## Graceful Shutdown

Handles SIGINT/SIGTERM: drains DownloadQueue (15s max), waits for active tasks, closes DB, then exits.
