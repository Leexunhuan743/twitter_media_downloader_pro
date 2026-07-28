# Logging

TMDP logs should read as a coherent operational timeline while remaining safe to expose in the Web UI, exported files, and bot alerts.

## Log Sinks

The logging stack fans one application log stream out to local files, console capture, Web UI APIs, and bot alert loops.

`main.go` initializes logrus with a text formatter, starts `consolelog.Hub` capture, and installs `[[internal/logging/lumberjack_hook.go#LumberjackHook]]` for rotated file writes. REST and SSE log consumers read from the in-memory hub; `client.log` remains a separate Resty client log.

`[[internal/consolelog/hub.go#StopCapture]]` restores logrus output before closing capture pipes, so start-server shutdown logs do not write to a closed stderr pipe. `main.go` owns final rotated-log writer cleanup after shutdown completes.

Terminal-only ANSI color may be used for compact human scan points such as tweet title fields. File and Web UI log paths strip ANSI through `[[internal/logging/sanitize.go#StripANSI]]` or console capture.

## Public Log Contract

Logs shown outside the process must be concise, consistently prefixed, and safe for operators to scan.

Every user-visible log line starts with a domain prefix such as `[cli]`, `[api]`, `[download]`, `[scheduler]`, or `[auth]`. The JSON API and Web UI may parse `level=...`, timestamps, `task_id`, and domain text, but the raw line remains the stable fallback.

## Sensitive Data

Secrets must never be written to logs in full.

Use `[[internal/logging/sanitize.go#MaskSecret]]`, `[[internal/logging/sanitize.go#RedactSensitiveText]]`, or `[[internal/logging/sanitize.go#SanitizeURL]]` before logging tokens, cookie values, API keys, JWTs, Authorization headers, or URLs that can contain `?token=`.

## HTTP Access Logs

HTTP request logs record the request outcome without leaking credentials from query strings.

`loggingMiddleware` logs `METHOD /path status=... dur=... ip=...` using a sanitized request target without a `target=` label. It uses `[[internal/logging/sanitize.go#RequestTarget]]` so SSE URLs such as `/api/v1/logs/stream?token=...` remain useful without exposing the token.

Successful `GET`, `HEAD`, and `OPTIONS` access logs are debug-only to keep Web UI polling, static files, health checks, and SSE connections out of normal output. Mutating requests stay info; any status >=400 is warning.

## Task Logs

Task logs should describe lifecycle milestones, not every inner loop iteration.

TaskManager emits `Created`, `Started`, and `Failed` entries with `task_id` so a run can be identified at its boundaries and on errors. `Completed`, `Cancelled`, and enqueue-depth summaries omit repeated task ids to keep routine output compact.

The service progress reporters emit `[task] Progress` entries for syncing, retrying, marking, and preparing milestones, plus `[task] Result` summaries when task work reports stats. These progress/result summaries do not repeat `task_id`; high-frequency `downloading` and `profile` updates stay in task state/SSE rather than log lines to keep CLI output and Web logs readable.

Task error messages must pass through `[[internal/logging/sanitize.go#RedactSensitiveText]]` before they are emitted. Target summaries should stay compact, such as `@screen_name`, `list:123`, `json-files:2`, or `batch:users=1,lists=1,following=0`.

## Download Logs

Download logs should make each run diagnosable from summaries without printing every successful media file.

`[[internal/service/download_service.go#downloadOptionsSummary]]` records task-level options at task start. Download phase starts such as media batch, follow members, retry, profile, mark, and JSON import include `task_id`; phase completion summaries omit repeated ids and focus on counts, leftovers, and `dur`.

Batch collect/preprocess internals, profile worker success summaries, and ordinary no-work skips are debug-only. User-facing info logs keep target summaries and phase boundaries; warnings remain for protected users, permission issues, partial profile file failures, retry failures, and disabled retry when pending failures exist. Empty retry rounds log one debug skipped line instead of start/complete pairs.

Low-level download helpers that immediately return errors keep phase details at debug level when a caller already emits the user-facing failure. This prevents duplicate failure lines while preserving root-cause context for debug runs.

Protected unfollowed users skipped during batch preprocessing are warnings because they explain why expected content will be absent.

Downloader and media failure logs must sanitize URLs with `[[internal/logging/sanitize.go#SanitizeURL]]`. Per-tweet summary lines start with the quoted tweet title, without a redundant event phrase or `title=` label. Clean successes print only the title; when failures or skips exist, summaries expand to `succeeded/failed/skipped/total` and affected count fields may be colored for terminal readability. Per-media successes stay out of logrus.

Tweet title logs use `[[internal/naming/tweet_naming.go#TweetNaming#LogFormat]]` so the displayed title stays close to the saved file name base while inserting a readable space before `_tweet_id` and trimming trailing title whitespace. Completion summaries rely on that title for the tweet id instead of adding a separate `tweet_id` field.

Caller context that explains a file download, such as `tweet_id`, should be passed through `[[internal/downloader/types.go#DownloadRequest]]` log fields so downloader retry logs remain traceable.

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

## Cleanup Phases

The logging cleanup phases standardized prefix drift, lifecycle coverage, and sensitive-data handling across the project.

They keep logrus/TextFormatter and existing Web UI parsing intact. Startup, API, queue, task, download, Twitter, scheduler, bot, CLI, profile, dumper, and file-writer logs now share domain prefixes and field-style event text.
