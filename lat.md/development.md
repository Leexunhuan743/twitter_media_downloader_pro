# Development

Conventions and gotchas for working on the TMDP codebase.

## Lat Workflow
Project guidance keeps `lat.md/` as the durable architecture and behavior graph for agents and reviewers.

- Start non-trivial repo work with `lat search` and `lat expand`; use `lat section` when a search result needs exact context.
- Keep `AGENTS.md` aligned with the locally installed `lat --help`, upstream `lat.md/cli.md`, and upstream source. Prefer those over generated templates when they disagree.
- `lat search` works offline by default, creates or updates `lat.md/.cache/vectors.db`, and accepts `--limit`; use `lat reindex --local|--remote` only for full rebuilds or backend switches.
- `lat check` covers markdown refs, code refs, directory indexes, and section leading paragraphs. Use `lat check md`, `lat check code-refs`, `lat check index`, or `lat check sections` for focused diagnosis.
- Treat `lat locate` and `lat expand` as lenient discovery tools. Any wiki link committed to docs must still pass strict resolution in `lat check`.
- After changing behavior, architecture, tests, or docs, update relevant `lat.md/` sections and run `lat check`.

## Logging Conventions
Every log line must follow the project's domain-prefix and capitalization standards.

- **Domain prefix**: every log line MUST start with `[domain]` where domain matches the package: `[auth]`, `[api]`, `[cli]`, `[config]`, `[cookies]`, `[db]`, `[logs]`, `[schedules]`, `[theme]`, `[upload]`, `[web]`, `[tasks]`, `[sse]`, `[download-queue]`, `[download]`, `[batch]`, `[jsonfile]`, `[jsonfolder]`, `[profile]`, `[twitter]`, `[rate-limit]`, `[server]`, `[downloader]`, `[scheduler]`, `[consolelog]`, `[listener]`, `[recovery]`, or `[bot-*]`.
- **Capitalization**: first character after `[domain]` MUST be uppercase.
- **Levels**: `Errorf` = user-visible internal failures, `Warnf` = non-fatal operational issues, `Infof` = state changes, `Debugf` = internal details.
- **Field style**: prefer `Event key=value key=%q` over sentence variants such as "Failed to ...".
- **Structured logs**: `log.WithFields{}.Levelf("msg")` also needs `[domain]` prefix and capital letter.
- **No err.Error() in user messages**: always `log.Errorf` the full error server-side, return a user-safe message.

## Error Response Pattern (API)
API errors follow a consistent structure to ensure client safety and debuggability.

```go
s.writeError(w, status, "user-safe message")
s.writeErrorDetail(w, status, "user-safe", err.Error())
```

- Raw `err.Error()` is NEVER in the `error` JSON field
- Internal server failures should be preceded by `log.Errorf` or `log.Warnf`
- Input validation failures should use `log.Debugf` and avoid polluting normal error logs

## HTTP Client Log

Both `tmd2.log` and `client.log` are rotated via lumberjack (2 MB max, 2 backups, 14 days retention). Server and CLI modes share the same rotation config.

Detailed logging sinks, redaction, and access-log rules are documented in [[logging]].

## Concurrency Model
TMDP uses diverse concurrency patterns across its components, each suited to its workload.

| Component | Model |
|-----------|-------|
| DownloadQueue | Single worker goroutine, sync.Cond |
| Tweet producers | ants.Pool (max 35) |
| Tweet consumers | N goroutines (N = MaxDownloadRoutine) |
| FileWriter | 256-slot hash mutex |
| Scheduler | Single goroutine, periodic ticker |
| Task cleanup | Hourly goroutine, deletes 24h+ terminal tasks |
| TweetDumper | sync.Mutex in service layer |

## X API Probe Tool

Diagnostic CLI for probing Twitter/X GraphQL failures such as HTTP 429 `error code: 1015`; it reuses real config and never prints credentials.

`tools/xapi-probe` checks whether failures are caused by API changes, request headers, proxy egress, account state, or burst load. It reuses `conf.yaml` credentials and `twitter.SetClientAuth`, and never prints `auth_token`, `ct0`, `Authorization`, `Cookie`, or `Set-Cookie`.

```bash
# Single requests: default headers vs browser-style headers, direct or via conf proxy
go run ./tools/xapi-probe -user backdoorgf -uid 1620929133340495873

# Concurrent burst against one user
go run ./tools/xapi-probe -user backdoorgf -uid 1620929133340495873 -burst 100

# Fetch a real List's members and burst UserMedia across different users
go run ./tools/xapi-probe -user backdoorgf -uid 1620929133340495873 -list 2018637651323310440 -burst 242

# One UserMedia request per configured account (master + additional_cookies.yaml)
go run ./tools/xapi-probe -user backdoorgf -uid 1620929133340495873 -accounts

# Save raw API response JSONs for inspection
go run ./tools/xapi-probe -user backdoorgf -uid 1620929133340495873 -list 2033597792896069633 -save-dir tools/xapi-probe/saved-api-json

# Stress ramp: find when 429/1015 appears (uses all configured accounts)
go run ./tools/xapi-probe -stress 543 -list 2033597792896069633 -delay 2s
```

The tool prints status codes, `Retry-After`, `X-Rate-Limit-*`, `Cf-Ray`, server, and a truncated body. Entry point: [[tools/xapi-probe/main.go#main]].

## Testing & CI

Standard Go testing commands and the current CI pipeline configuration.

```bash
go test ./...
go test -race -count=1 ./...
go build -o tmdp.exe .
go vet ./...
lat check
```

Tests use `database.MemoryDSN` with a unique in-memory database name per call, so shared-cache SQLite state cannot leak between tests in the same package/process.

CI (`.github/workflows/go.yml`) triggers on tag push (`v*`). Its `verify` gate runs `go test -race -count=1 ./...`, `go vet ./...`, and pinned `lat.md@0.12.2 check` on Ubuntu before the linux/windows/darwin amd64/arm64 release-build matrix starts. Release builds use `CGO_ENABLED=0`, `-trimpath`, and `-ldflags "-w -s ..."` to keep binaries compact and path-free. Ordinary branch/PR CI remains a separate delivery decision.

### Network Timeout Tests
Network tests should synchronize on observable server events rather than depending on tiny timeout windows.

Downloader and profile tests that verify retry or cancellation behavior should wait for the test server to receive the intended request before cancelling or asserting. Avoid 20-50 ms timing assumptions because full-package runs can delay local HTTP scheduling.

Tests that only need an `httptest` response should also give Resty `server.Client()` rather than a default client, keeping host proxy and transport state outside the test contract.

### Test Fixture Privacy
Tests must use synthetic identifiers and reserved/example URLs rather than real production data.

Do not put real tweet ids, user ids, media URLs, CDN URLs, or copied live-download log snippets in tests. Prefer obvious fake ids such as `1000000000000000001`, local `httptest.Server` URLs, and reserved domains such as `example.invalid`; if a parser specifically needs a production host shape, keep the path and ids synthetic.

## What NOT to Do
Rules to avoid when making changes to the codebase.

- Don't bypass `service.DownloadService` with duplicate logic in CLI and API
- Don't change Twitter bearer/GraphQL endpoints unless fixing related issues
- Don't convert async server tasks to sync HTTP
- Don't put 403/404 media errors in retry queue
- Don't change start script exit codes (`start-server.bat` expects 0)
- Don't format the whole repo
- Don't change DB schema without migration + test

## Dependency Rules
Import direction constraints between packages to prevent cycles.

- `internal/api` imports `internal/bot` (Bot interface)
- Bot notification helpers live in `internal/api/bot_notify.go` (avoids bot→api cycle)
- `internal/service` imports `internal/downloading` (reverse: downloading has no service dep)
- All bot platforms import `internal/api` for TaskManager + EventBus types
