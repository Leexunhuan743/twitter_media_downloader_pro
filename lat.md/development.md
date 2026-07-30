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

## Testing & CI

Standard Go testing commands and the current CI pipeline configuration.

```bash
go test ./...
go test -race -covermode atomic -coverprofile=covprofile ./...
go build -o tmdp.exe .
go vet ./...
```

CI (`.github/workflows/go.yml`): only triggers on tag push (`v*`), builds release binaries for linux/windows/darwin on amd64/arm64. Release builds use `CGO_ENABLED=0`, `-trimpath`, and `-ldflags "-w -s ..."` to keep binaries compact and path-free. **No PR/push test job** — add a `test.yml` if CI tests are needed.

### Network Timeout Tests
Network tests should synchronize on observable server events rather than depending on tiny timeout windows.

Downloader and profile tests that verify retry or cancellation behavior should wait for the test server to receive the intended request before cancelling or asserting. Avoid 20-50 ms timing assumptions because full-package runs can delay local HTTP scheduling.

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
