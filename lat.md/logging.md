# Logging

TMDP logs should read as a coherent operational timeline while remaining safe to expose in the Web UI, exported files, and bot alerts.

## Log Sinks

The logging stack fans one application log stream out to local files, console capture, Web UI APIs, and bot alert loops.

`main.go` initializes logrus with a text formatter, starts `consolelog.Hub` capture, and installs `[[internal/logging/lumberjack_hook.go#LumberjackHook]]` for rotated file writes. Both rotated files (`tmd2.log` and `client.log`) are created through the shared `[[internal/logging/rotation.go#NewRotatingWriter]]` factory (2 MB / 2 backups / 14 days / gzip), and the formatter base configuration is shared via `[[internal/logging/rotation.go#NewTextFormatter]]`. The terminal-facing logger forces color through capture pipes unless `NO_COLOR` is non-empty, in which case both logrus and gookit/color emit plain text. Resty's multiline sink disables quoting. REST and SSE log consumers read from the in-memory hub; `client.log` remains a separate Resty client log written by `[[internal/cli/executor.go#SetClientLogger]]`.

`main.go` defers `[[internal/consolelog/hub.go#StopCapture]]` after logger initialization and before rotated-writer cleanup, covering CLI completion, startup failure, and server shutdown. Capture shutdown restores only outputs still owned by that session, closes its pipes, and waits for its workers before the log writers are closed.

Terminal-only ANSI color may be used for compact human scan points such as tweet title fields, but `NO_COLOR` is an explicit process-wide opt-out. File and Web UI sink boundaries use `[[internal/logging/sanitize.go#SanitizeLogText]]` to consume UTF-8 as complete runes, strip CSI/OSC/C1 escapes, then redact recognized credentials and unsafe controls. Web log filters and all UI themes use the current `INFO[...]` TextFormatter lines.

Web1 renders the same TextFormatter lines as the CLI contract, adding display-only highlighting for timestamps, domain prefixes, and key=value fields. The raw log text remains the copy/export source.

## Console Hub

The console Hub is a bounded, concurrency-safe bridge from process stdout and stderr to retained snapshots and live subscribers.

`[[internal/consolelog/hub.go#Hub]]` has a usable zero value, retains lines from oldest to newest, sanitizes them at the public boundary, and caps each stored line at 16 KiB with a `[truncated]` suffix. Pipe capture applies the same bound to unterminated input and resumes normal collection at the next newline.

Subscriber send and close operations share one mutex-owned channel lifecycle. Queue overflow closes and removes only the slow subscriber without logging back through the captured logrus stream. `Hub.Close` is terminal: it preserves the snapshot, ignores later additions, closes current and future subscriptions, and stops capture only when that Hub owns the session.

`[[internal/consolelog/hub.go#StartCapture]]` is idempotent for the active owner and returns `ErrCaptureAlreadyActive` when another Hub owns process capture. Each capture session owns its worker wait group, so shutdown waits for exactly the workers attached to the restored pipes.

## Public Log Contract

Logs shown outside the process must be concise, consistently prefixed, and safe for operators to scan.

Every user-visible log line starts with a domain prefix such as `[cli]`, `[api]`, `[download]`, `[scheduler]`, or `[auth]`. The JSON API and Web UI parse current `INFO[...]` TextFormatter prefixes, timestamps, task ids, and domain text, but the raw line remains the stable fallback.

## HTTP Client Log

The Resty client log mirrors the main log's full-detail policy while redacting credentials before they reach disk.

`[[internal/cli/executor.go#SetClientLogger]]` enables Resty debug (`SetDebug(true)`) and sets the dedicated logger to debug level, so `client.log` records every request and response (method, URL, status, duration, headers, body) regardless of the `-dbg` flag. `OnRequestLog`/`OnResponseLog` sanitize headers and bodies before composition; `[[internal/logging/sanitizing_logger.go#SanitizingLogger]]` then cleans the fully formatted block, including absolute URL userinfo and sensitive query values in Resty's request line. Body output is capped at 256 KB; Resty checks responses before JSON indentation and requests after request-body formatting, keeping the final block below the 2 MB lumberjack write limit. The media download client (`internal/downloader`) is not wired to `client.log`; its logs live in the main log.

## Sensitive Data

Secrets must never be written to logs in full.

Use `[[internal/logging/sanitize.go#MaskSecret]]`, `[[internal/logging/sanitize.go#RedactSensitiveText]]`, `[[internal/logging/sanitize.go#SanitizeHeaders]]`, or `[[internal/logging/sanitize.go#SanitizeURL]]` before logging tokens, cookies, passwords, API/client secrets, JWTs, Authorization values, URL user information, or sensitive query/fragment values. Fingerprints are stable and idempotent, allowing correlation without retaining plaintext. URL sanitation is fail-closed: an invalid URL is replaced by one fingerprint, while an unparseable query is replaced by a `malformed_query` fingerprint instead of preserving partially parsed or raw input.

## HTTP Access Logs

HTTP request logs record the request outcome without leaking credentials from query strings.

`loggingMiddleware` logs `METHOD /path status=... dur=... ip=...` using a sanitized request target without a `target=` label. It uses `[[internal/logging/sanitize.go#RequestTarget]]` so SSE URLs such as `/api/v1/logs/stream?token=...` remain useful without exposing the token. Malformed query syntax deliberately sacrifices individual parameters and retains only the path plus a stable fingerprint.

Successful `GET`, `HEAD`, and `OPTIONS` access logs are debug-only to keep Web UI polling, static files, health checks, and SSE connections out of normal output. Mutating requests stay info; any status >=400 is warning.

The Web log API treats fatal lines as part of the error level for stats and filters, so the ERROR button shows every critical log counted in its badge.

## Task Logs

Task logs should describe lifecycle milestones, not every inner loop iteration.

TaskManager emits `Created`, `Started`, and `Failed` entries with `task_id` so a run can be identified at its boundaries and on errors. `Completed`, `Cancelled`, and enqueue-depth summaries omit repeated task ids to keep routine output compact.

The service progress reporters emit `[task] Progress` entries for syncing, marking, and preparing milestones, plus `[task] Result` summaries when task work reports stats. These progress/result summaries do not repeat `task_id`; high-frequency `downloading`, `retrying`, and `profile` updates stay in task state/SSE rather than log lines to keep CLI output and Web logs readable.

Task error messages must pass through `[[internal/logging/sanitize.go#RedactSensitiveText]]` before they are emitted. Target summaries should stay compact, such as `@screen_name`, `list:123`, `json-files:2`, or `batch:users=1,lists=1,following=0`.

## Download Logs

Download logs should make each run diagnosable from summaries without printing every successful media file.

`[[internal/service/download_service.go#downloadOptionsSummary]]` records task-level options at task start. Download phase starts such as media batch, follow members, retry, profile, mark, and JSON import include `task_id`; phase completion summaries omit repeated ids and focus on counts, leftovers, and `dur`.

Batch collect/preprocess internals, profile worker success summaries, and ordinary no-work skips are debug-only. User-facing info logs keep target summaries and phase boundaries; warnings remain for protected users, permission issues, partial profile file failures, retry failures, and disabled retry when pending failures exist. Empty retry rounds log one debug skipped line instead of start/complete pairs.

Low-level download helpers that immediately return errors keep phase details at debug level when a caller already emits the user-facing failure. This prevents duplicate failure lines while preserving root-cause context for debug runs.

Protected unfollowed users skipped during batch preprocessing are warnings because they explain why expected content will be absent.

Downloader and media failure logs must sanitize URLs with `[[internal/logging/sanitize.go#SanitizeURL]]`. Per-tweet summary lines start with the readable tweet title, without outer quotes, a redundant event phrase, or a `title=` label. Clean successes print only the title; when failures or skips exist, summaries expand to `succeeded/failed/skipped/total` and affected count fields may be colored for terminal readability. Per-media successes stay out of logrus.

Tweet title logs use `[[internal/naming/tweet_naming.go#TweetNaming#LogFormat]]` so the displayed title stays close to the saved file name base while inserting a readable space before `_tweet_id` and trimming trailing title whitespace. Completion summaries rely on that title for the tweet id instead of adding a separate `tweet_id` field.

Caller context that explains a file download, such as `tweet_id`, should be passed through `[[internal/downloader/types.go#DownloadRequest]]` log fields so downloader retry logs remain traceable. Downloader logs render those caller fields before per-event fields such as `attempt`, `max_retries`, `url`, and `error`.

## Field Style

Operational logs should be easy to grep without requiring a structured logging backend.

Prefer a short event phrase followed by `key=value` fields: `task_id`, `type`, `target`, `path`, `count`, `dur`, `reason`, and sanitized `error`. Avoid symbol-only success markers, `fmt.Print*` progress output, and sentence variants such as "Failed to ...".

Local filesystem paths in log fields should pass through `[[internal/logging/sanitize.go#Path]]` before `%q` formatting so Windows paths display with `/` separators while Unix-style paths remain readable.

## Twitter API Logs

Twitter API logs should explain account availability and rate-limit waits without exposing credentials or raw API payloads.

Use `[twitter]` for account/login/API parsing context and `[rate-limit]` for request counting, endpoint readiness, client selection, and sleep/wait decisions. `[[internal/twitter/logging.go#clientNameForLog]]`, `[[internal/twitter/logging.go#endpointForLog]]`, and `[[internal/twitter/logging.go#errorForLog]]` keep account, endpoint, and error fields consistent.

Rate-limit sleeps and no-client states are warnings because they explain stalled work. Per-request counts, client selection, response header refreshes, and parser skips stay debug-only.

## Peripheral Logs

Peripheral logs should keep integrations and imports observable without competing with the core task and download timeline.

Scheduler logs use `[scheduler]` for lifecycle, reload, manual trigger, scheduled trigger, stale-generation exits, and empty-task failures. Stale-generation exits are debug because they are expected after reloads; empty-task, status mismatch, and panic paths remain warnings or errors. Bot logs use provider prefixes such as `[bot-telegram]` and log startup plus delivery failures with action/status/error fields, never credentials. An empty bot config is an info-level skipped state, not a warning.

JSON import logs use `[jsonfile]` for third-party files and `[jsonfolder]` for `.loongtweet` folders. File and folder summaries report tweet/media counts, failed tweet counts, and `dur` through logrus rather than direct console printing.

Bot alert loops treat current `ERRO[...]`/`FATA[...]` TextFormatter lines as alert-worthy, keeping provider alerts aligned with terminal and Web UI output. If a slow provider subscription overflows and the Hub removes it, the loop emits a warning and resubscribes after a short backoff; a terminal Hub close or provider stop still exits the loop.

## Cleanup Phases

The logging cleanup phases standardized prefix drift, lifecycle coverage, and sensitive-data handling across the project.

They keep logrus/TextFormatter and existing Web UI parsing intact. Startup, API, queue, task, download, Twitter, scheduler, bot, CLI, profile, dumper, and file-writer logs now share domain prefixes and field-style event text.

## Verification

Logging tests lock sink safety, formatter/rotation compatibility, and failure behavior without external services.

Regression coverage includes JSON and header-style credentials, URL user information/query/fragment values, malformed query and invalid URL fail-closed behavior, non-canonical HTTP header casing, CSI/OSC controls, public hub sanitization, zero-value and terminal Hub behavior, concurrent subscriber closure, capture ownership, bounded unterminated lines, nil hook inputs, short writes, Resty request/response bodies, and the 256 KB client-log body cap. See [[development#Development#Testing & CI]].
