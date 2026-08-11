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

Entity mutations validate the complete request before mutation. User metadata fields update atomically before an optional name change; name changes move the matching storage directory through the shared [[database#Database#Entity Storage Lifecycle]]. Target/name races return `409 Conflict`, rows deleted during the operation return `404 Not Found`, and `parent_dir` remains immutable. When a name change fails after statistics were already saved, the 409 response's `error` message states that the statistics were saved but the name change was rejected (retry is idempotent). Deleting a user/list entity also deletes its directory through staged removal with rollback on database failure; deleting a user or list cascades through its entities first, so their media directories are removed through the same staged lifecycle instead of being orphaned. The global previous-names search (`?q=`) matches screen name and display name fields (including the joined current user name); Web3's Previous Names tab uses the `user-previous-names` path, and Web2's stats cards read the backend `lsts` key.

## Web UI

Three independent frontend themes in `internal/api/web/`:

web1 additionally surfaces backend features with no dedicated UI elsewhere: a failed-records panel on the tasks page (`/api/v1/errors` list/retry-all/clear), a queue-depth card on the overview page (`/api/v1/queue/status`), single-target mark buttons on the user/list/following task forms, related-entity drilldown from data rows (user → entities/links, list → entities, with filter banner + clear), and a per-table record-count bar on the data page (`/api/v1/db/stats`, rendered inside the page header next to the table tabs). Task form input and the active task tab survive page switches via `_taskFormState`/`_taskFormTab`. The system page has a security tab (JWT session status with expiry, API Key login/test/refresh/clear without persisting the key to localStorage), and the schedules page offers a reload button (`POST /schedules/reload`) for external `schedules.yaml` edits.

Browser regression coverage for web1 lives in `tools/web1-e2e/` (framework-free scripts runnable through the omp browser against an isolated instance; helpers + 9 test files + run-all entry). It asserts visibility rather than element existence, re-queries DOM before each click (SPA rebuilds detach snapshots), anchors buttons by `data-action`, and covers navigation, system tab switching (including the security-panel regression), data tab switching, task forms, schedule diff-CRUD lifecycle, logs controls, drawer accessibility, theme round-trip, and the mark-task lifecycle.

web1 schedule form saves are diff-based per-entry CRUD instead of full replacement: entries are compared against the server baseline loaded at form init (`_state._scheduleBaselineIds`), so creates use `POST /schedules`, edits use `PUT /schedules/{id}`, and only entries the user explicitly removed are `DELETE`d — external additions by other clients survive a save. Full replacement `PUT /schedules` remains only as a fallback when the baseline was never loaded. The task list updates keyed-incrementally by `task_id` (row elements reused, only progress/status/buttons patched) instead of rebuilding the whole list on every SSE snapshot, and the data page lazily renders only the viewport-visible table/cards (desktop vs mobile) with a resize crosspoint re-render. The log stream preserves loadMore-prepended pages from the 5000-line DOM cap via `_prependedCount`. Accessibility: sidebar/mobile nav items are keyboard-focusable (`role=link` + `tabindex=0` + Enter/Space navigation + `aria-current`), drawer and auth modal are `role=dialog`/`aria-modal` with focus management, Tab focus traps, and Esc-to-close, toasts announce via `aria-live` (errors `role=alert`), the SSE indicator is a `role=status` region, and `--text-tertiary`/`--text-disabled` were lifted to WCAG AA contrast.

web3 covers the same backend surface with a dark glassmorphism UI (native JS, zero build): hash-based routing (`#/dashboard` etc., restored from `location.hash` after theme-switch reloads), dashboard with health/task stats/queue depth/recent tasks, tasks with keyed incremental rows + download-type modal forms (user/list/following/batch/JSON file+folder/mark with optional RFC3339 timestamp) + failed-records panel, data console with 6 tables + stats + search + sort + pagination + row view/edit/delete (PATCH field whitelist: `parent_dir` read-only, `latest_release_time` RFC3339 no-millis), schedules with per-entry create/edit/delete + enable toggle + trigger + raw YAML, settings with config fields (masked passwords via keep sentinels) / cookies (data-orig + `__KEEP_OLD__`) / security (JWT status, API key never persisted) / raw YAML, and a logs viewer with level/domain/q/time filters, client-side SSE time-window filtering, load-more with generation guard, pause/resume and fetch+blob export. All API calls go through one request layer with JWT refresh and auth/check probes. The theme switcher auto-discovers `web3` via `listThemes()` (any directory under `internal/api/web/` with an `index.html`); `//go:embed web/*` picks it up with no backend changes.

web2 covers the same backend surface with a lighter UI: a dashboard landing page (`/`) with health/task stats/queue depth/recent tasks, tasks page with quick download + failed-records panel, data console with 6 tables + stats + search + sortable headers + row-level view/edit/delete (entities/links detail modals support editing via the PATCH contract), schedules with form create/edit (all 4 types + download options, mixed-type edit fixed) and a raw YAML editor, system console with config/cookies/security tabs + queue status, and a logs viewer with level/domain/q filters, pause, export (fetch+blob), and SSE streaming. JSON download forms support multipart file upload as well as server paths; mark actions accept an optional timestamp (converted to RFC3339 before submit); cookies form saves unchanged fields via `__KEEP_OLD__` sentinels so masked values never round-trip. Task rows update keyed-incrementally on SSE snapshots, log pagination carries a generation guard, and the modal has a Tab focus trap with focus restore. JSON download forms support multipart file upload as well as server paths; mark actions accept an optional timestamp. Both themes guard against stale responses with request sequence counters and reset SSE reconnect counters on successful events.

```
internal/api/web/
├── shared/
│   └── datetime.js # UTC/local editor conversion
├── web1/          # Classic theme
│   ├── index.html
│   ├── app.js     (~260KB)
│   └── styles.css (~48KB)
├── web2/          # New streamlined theme
│   ├── index.html
│   ├── app.js     (~161KB)
│   ├── styles.css (~26KB)
│   └── favicon.svg
└── web3/          # Dark glassmorphism theme
    ├── index.html
    ├── app.js     (~109KB)
    └── styles.css (~23KB)
```

- **No build step** — pure HTML/CSS/JS, embedded via Go `//go:embed`
- **Runtime hot-switch** — `GET/POST /api/v1/config/theme` + `GET /api/v1/config/themes`
- **Theme switcher** — server-injected switcher from `themeSwitcherHTML()`; each theme may place and style it within its own navigation model
- **Security** — validates target directory exists and contains index.html
- **Shared backend** — all three themes call same REST API + EventSource SSE

### Shared Date-Time Contract

Web2 and Web3 edit database instants in local browser controls without changing the stored moment. Web1 displays database instants in the browser's local timezone too (through its `formatDate` helper) instead of showing the raw UTC string.

`/static/shared/datetime.js` exposes `TMDDateTime.toDateTimeLocal` and `TMDDateTime.toRFC3339`. It converts UTC RFC3339 values to local wall-clock input values and converts edits back to UTC; invalid values fail closed as empty strings. [[internal/api/frontend_datetime_test.go#TestFrontendDateTimeRoundTrip]] executes the shipped JavaScript under positive and negative UTC offsets, while [[internal/api/frontend_datetime_test.go#TestSharedFrontendDateTimeAssetIsEmbedded]] verifies the shared asset is embedded.

## Web3 Console Theme

Web3 is a zero-build dark glass operations console that preserves the shared REST and SSE contracts while providing its own hash-routed presentation layer.

The theme uses neutral dark page surfaces, restrained translucent panels, one brand accent, and semantic success, warning, error, and information colors. Desktop keeps a fixed navigation rail; at 900px and below, mobile/tablet layouts move it into an off-canvas menu and keep primary controls, compact actions, form fields, theme options, and labeled toggles at least 44px high. The Logs filter grid uses two columns from 901px through 1220px so the rail cannot force horizontal overflow.

[[internal/api/web/web3/app.js#enhanceThemeSwitcher]] moves the server-injected theme switcher into the sidebar so it no longer obscures health state or mobile content. The Tasks, Data, and Settings segmented controls use tablist, tab, and tabpanel relationships with arrow-key navigation.

### Presentation Contract

Web3 assets must keep responsive background continuity, themed native controls, explicit form labels, keyboard-visible focus, and readable long log lines across desktop and mobile layouts.

[[internal/api/web3_frontend_test.go#TestWeb3ThemePresentationContract]] locks the static contract for mobile surface continuity, verifies 44px touch rules inside the full 900px mobile breakpoint without a narrower small-button override, and covers the mid-width Logs grid, tab semantics, labels, local SVG icons, and wrapped log output. `tools/web3-e2e/01-responsive-logs.js` is the browser geometry check for 901, 1000, 1216, and 390 CSS-pixel viewports against the isolated read-only mock server.

## Web1 Console Architecture

`web1/app.js` is a single-file vanilla JS SPA (~5100 lines) with a custom store + subscriber pattern.

### Task Console

The Web1 task console renders task state from REST snapshots and SSE task broadcasts without inventing extra task states.

Task list status filters use the task `status` field, while stage filters use `progress.stage` values such as `downloading`, `retrying`, `profile`, and `marking`. Task IDs are shortened only for display; full IDs remain in `data-task-id`, tooltips, and detail views.

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

Form saves run a diff against the baseline entries loaded when the form was initialized: new entries (no id or id not in baseline) go through `POST /schedules`, changed entries through `PUT /schedules/{id}`, and entries removed from the form through `DELETE /schedules/{id}` — entries added by other clients after form load are left untouched, avoiding silent overwrites. `normalizeSchedForDiff` produces a fixed-key-order JSON fingerprint (id excluded) for change detection; the old full-replace `PUT /schedules` remains as a fallback when no baseline was ever loaded. A reload button on the schedules page calls `POST /schedules/reload` for external `schedules.yaml` edits.

### Log Viewer

The Web1 log viewer renders backend TextFormatter lines directly, then applies display-only highlighting for scanability.

Historical log pages and live log SSE events share the same rendering helpers for ANSI stripping, timestamp/domain highlighting, field highlighting, and tweet-id click-to-copy. Log export appends the JWT token as a query parameter because `window.open` cannot send the API client's Authorization header.

The log API and live stream both accept `level`, `q`, and `domain` filters, so the Web1 domain selector has the same pagination and realtime semantics as the level filter. The `q` text filter remains available at the API level for other clients. Domain values match bracketed prefixes such as `[download]` and `[api]`.

The Web1 log viewer renders backend TextFormatter lines directly with display-only highlighting; controls are level filter, domain filter, auto-scroll, and export.

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

Handles SIGINT/SIGTERM and API shutdown without adding fixed sleeps or serial timeout penalties to the normal lifecycle.

[[signal.go#notifyOnShutdownSignal]] claims only the first signal, restores default handling so a second signal can force termination during a slow drain, and waits for an in-flight shutdown callback before releasing caller-owned resources.

Server construction returns dependency errors to `[[main.go#runServer]]`. Once construction succeeds, `runServer` invokes idempotent graceful shutdown and explicitly waits for `shutdownDone` on listener closure, so partially started schedulers, bots, background cleanup loops, and database resources are released before the process exits. Shutdown first closes mutation admission outside authentication and cancels tasks, then starts queue, scheduler, Bot, and HTTP convergence concurrently. All phases share one 45-second deadline instead of consuming independent timeout windows; an idle server therefore closes immediately while admitted work receives only the time it actually needs. Task SSE handlers flush `server_shutdown` and return, while log streams close directly.

[[internal/api/server.go#Server#Start]] is a one-shot lifecycle boundary coordinated with shutdown: a start after shutdown returns `http.ErrServerClosed`, a duplicate start returns an error, and cleanup stops only bots whose `Start` was attempted. Early-return paths (shutdown already in progress) close the startup signal so the shutdown's bot phase does not wait out the full deadline. The core HTTP listener is not held behind optional external providers; Bot starts run concurrently after lifecycle state is installed, and the startup wait is bounded by the shutdown timeout so a hung provider start cannot prevent already-started bots from being stopped. The lifecycle mutex protects state transitions but is never held while scheduler or Bot code runs. Telegram bounds synchronous `GetMe` initialization to 15 seconds. Discord bounds Gateway establishment and command registration with an overall startup deadline that interrupts the underlying connections (never `session.Close`, which would deadlock behind discordgo's lock during a stalled open), then restores long-lived connection settings. The scheduler refuses to start after a shutdown has been requested (TOCTOU guard). Shutdown signals are registered before `Server.Start` enters its blocking listener.
