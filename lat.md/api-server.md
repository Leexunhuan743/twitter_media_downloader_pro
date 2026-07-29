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
- 401 response body is always `{"success":false,"error":"unauthorized"}` + `WWW-Authenticate: Bearer`
- Failure details for clients are exposed via `X-Token-Type` (`missing`, `invalid`, or `expired`) rather than the JSON error field

### Auth Endpoints

JWT-based authentication endpoints. Only available when `api_key` is configured.

```
POST /api/v1/auth/login    # Login with API key, returns JWT token
POST /api/v1/auth/refresh  # Refresh JWT token before expiry
GET  /api/v1/auth/check    # Check current JWT validity
```

Web1 treats `401` as an auth boundary instead of a page-local load error. `X-Token-Type=expired` allows one JWT refresh attempt; invalid or missing tokens go straight to the auth dialog. Final auth failure clears cached JWT state and opens the dialog with a readable status message.

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

### Error Management

Endpoints to inspect and retry failed downloads.

```
GET    /api/v1/errors         # List all failed items
POST   /api/v1/errors/retry   # Retry all failed items
DELETE /api/v1/errors         # Clear all error records
```

### Config, Cookies, Schedules, Logs, DB Management

Endpoints for all remaining management and configuration operations.

```
GET/PUT  /api/v1/config, /api/v1/config/raw, /api/v1/config/fields
GET/PUT  /api/v1/cookies, /api/v1/cookies/raw
GET/PUT  /api/v1/schedules, /api/v1/schedules/raw
POST     /api/v1/schedules, /api/v1/schedules/reload, /api/v1/schedules/validate
POST     /api/v1/schedules/trigger-all
GET      /api/v1/schedules/stats
PUT      /api/v1/schedules/{id}
DELETE   /api/v1/schedules/{id}
PATCH    /api/v1/schedules/{id}/enabled
POST     /api/v1/schedules/{id}/trigger
GET      /api/v1/logs, /api/v1/logs/stats, /api/v1/logs/export, /api/v1/logs/stream
GET/PATCH/DELETE /api/v1/db/users/{id}, /api/v1/db/lists/{id}
GET/PATCH/DELETE /api/v1/db/user-entities/{id}, /api/v1/db/list-entities/{id}
GET/PATCH/DELETE /api/v1/db/user-links/{id}
GET      /api/v1/db/user-previous-names
GET      /api/v1/db/stats
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

## Web1 Console Architecture

`web1/app.js` is a single-file vanilla JS SPA (~5100 lines) with a custom store + subscriber pattern.

### Task Console

The Web1 task console renders task state from REST snapshots and SSE task broadcasts without inventing extra task states.

Task list status filters use the task `status` field, while stage filters use `progress.stage` values such as `downloading`, `retrying`, `profile`, and `marking`. Task IDs are shortened only for display; full IDs remain in `data-task-id`, tooltips, detail views, and search matching.

Task creation and task mutation buttons use a client-side pending-action guard so repeated clicks do not submit duplicate requests. The task detail drawer tracks the open task ID and refreshes its content from each SSE task snapshot when that task is present.

### Data Console

The Web1 data console renders database tables from shared column definitions so desktop tables and mobile cards expose the same fields.

Data loads track per-subpage loading and error state. A request sequence guard prevents stale responses from earlier tabs or pages from overwriting the currently selected table, and the data-page detector watches loading/error/filter state so those states render immediately.

Previous-name filtering is explicit: clicking a user in Previous Names sets the `userId` API filter, shows a banner with the active filter, and provides a clear action that resets pagination before reloading.

### System Config Console

The Web1 system config console edits runtime YAML and form fields while preserving auth state boundaries.

Raw config saves compare the old and new `api_key` before mutating `configRaw`; if the key changes or is removed, cached JWT credentials are cleared. Config and cookies form data use `null` for not-yet-loaded and an empty array for loaded-but-empty so loading states and empty states do not collide.

### Schedule Console

The Web1 schedule console edits scheduler rules through raw YAML or structured forms while staying aligned with backend scheduler validation.

Structured schedule entries use the backend JSON contract (`id`, `run_on_start`, `auto_follow`, etc.) rather than legacy Go field names. Form validation cancels stale field checks with `AbortController`, keeps a request sequence guard, and focuses the matching rule when backend errors mention `schedule #N`.

Structured form deletes are undoable until a save or reload replaces local state. Schedule trigger, trigger-all, and enable/disable controls share the same pending-action guard so repeated clicks do not submit duplicate requests.

### Log Viewer

The Web1 log viewer renders backend TextFormatter lines directly, then applies display-only highlighting for scanability.

Historical log pages and live log SSE events share the same rendering helpers for ANSI stripping, timestamp/domain highlighting, field highlighting, and tweet-id click-to-copy. Log export appends the JWT token as a query parameter because `window.open` cannot send the API client's Authorization header.

The log API and live stream both accept `level`, `q`, and `domain` filters, so the Web1 domain selector has the same pagination and realtime semantics as level and text search. Domain values match bracketed prefixes such as `[download]` and `[api]`.

The Web1 log view supports pausing visual insertion of live lines without closing the SSE connection. While paused, matching lines are counted; resuming refreshes history so skipped live lines are loaded through the same paginated API path.

Rendered log rows keep the stripped raw line in `data-log-line`, expose explicit copy buttons for the whole line and tweet id, and cap the live DOM stream at 5000 rows to avoid unbounded browser memory growth.

### Client Request Safety

The Web1 API client centralizes request cancellation, timeout handling, JWT refresh, and endpoint naming so page code does not duplicate transport behavior.

Normal API calls use a 60 second timeout, while multipart uploads use a 5 minute timeout. Navigation-triggered aborts still surface as `AbortError`, but timeout-triggered aborts become user-readable timeout errors.

Database endpoint helpers keep relation-scoped methods (`getDBUserRelatedEntities`, `getDBUserRelatedLinks`, `getDBListRelatedEntities`) distinct from global table methods (`getDBUserEntities`, `getDBUserLinks`, `getDBListEntities`) so object literal definitions cannot silently overwrite each other.

### SSE And App Lifecycle

The Web1 app treats bootstrap, realtime reconnection, and page refresh as separate lifecycle paths.

`init()` is guarded by a single bootstrap promise and starts the JWT refresh interval through an idempotent loop starter. The SSE indicator resumes the EventSource and refreshes the current page instead of re-running application initialization, preventing duplicate JWT intervals and repeated bootstrap work.

SSE reconnect scheduling is single-flight: an existing reconnect timer is reused until it fires or is manually cancelled by `resume()`. Reconnected overview pages refresh both health and task snapshots, while other pages use their page-specific refresh path.

### Rendering Safety

Web1 templates must escape values according to their output context and use fixed class names for backend-controlled status values.

Use `escapeHtml` for text nodes and `escapeAttr` for attribute values such as `value`, `placeholder`, `data-*`, and `class`. Backend task statuses are rendered through a whitelist mapping before they become tag text or `status-*` classes.

### Store Notification Model

`store.setState` updates `store.state` synchronously via `deepMerge`, but notifies subscribers **asynchronously** via a `Promise.resolve().then()` microtask.

Multiple `setState` calls in the same tick are batched via `_notifyPending` flag. This async notification is critical for the skip flag mechanism below.

### DualModeEditor Factory

The system page has three raw/form dual-mode editors (config / cookies / schedules) with identical structure. [[internal/api/web/web1/app.js#createDualModeEditor]] abstracts:
- `setMode(mode)` — switch raw/form, with skip flag set AFTER `store.setState` (relies on async notification)
- `rebuild()` — wraps `rerenderSystemPanel` (initEditor must be a function reference, not arrow function)
- `destroyEditor()` / `resetSkipFlag()` / `isSkipFlagSet()` / `consumeSkipFlag()` — lifecycle & flag management

Three instances (`configEditor` / `cookiesEditor` / `scheduleEditor`) are created via the factory. Original `setConfigMode` / `setCookiesMode` / `setScheduleTab` are preserved as thin wrappers to avoid touching the data-action dispatch table.

### Skip Flag Mechanism (depends on async store notification)

When `setMode('raw')` is called and raw data is already cached, the factory synchronously rebuilds the panel and sets `_xxxPanelSkipNextRebuild = true` AFTER `store.setState`.

When the store's microtask fires `syncSystemPage`, the rebuild function sees the skip flag and skips rebuild (only updating `_state.lastXxxRaw`). This prevents double rebuild. If the store ever changes to synchronous notification, the skip flag must be set BEFORE `store.setState` instead.

### syncSystemPage Change Detection

`syncSystemPage` uses [[internal/api/web/web1/app.js#systemDetector]] (created via `makeChangeDetector`) to detect which state keys changed, replacing 18 lines of manual `lastXxx` comparisons.

Three independent rebuild functions (`rebuildConfigPanel` / `rebuildCookiesPanel` / `rebuildSchedulePanel`) handle each panel. `_state.lastConfigRaw` / `lastCookiesRaw` / `lastScheduleRaw` are preserved (not in `_state` definition, kept as dynamic properties starting `undefined`) for the `rawRebuildNeeded` boundary check: `changed.xxxRaw && _state.lastXxxRaw === null && state.xxxRaw !== null` detects first raw data load. Initializing these to `null` would change behavior (`undefined === null` is false, `null === null` is true).

## Graceful Shutdown

Handles SIGINT/SIGTERM: drains DownloadQueue (15s max), waits for active tasks, closes DB, then exits.
