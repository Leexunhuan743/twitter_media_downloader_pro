# CLI Runtime

Startup and CLI orchestration define how TMDP separates bootstrap flags, loads runtime dependencies, and dispatches command-line download work.

## Bootstrap Flags

Bootstrap flags are consumed by `main.go` before the remaining arguments are passed to the CLI parser.

`[[main.go#parseBootstrapArgs]]` handles only `-conf`, `-dbg`, `-server`, and `-port`. Unknown flags are preserved in `bootstrapArgs.cliArgs` for `internal/cli`, which keeps server startup concerns separate from download task flags.

Port selection is layered: explicit `-port` wins, then `TMD_PORT`, then default `25556`. Invalid ports fail before config loading so server startup cannot proceed with an ambiguous listener.

`main` delegates to `[[main.go#run]]`, which returns startup and CLI execution errors to the process boundary. After logging is initialized, `[[main.go#logRunError]]` records final errors before rotating-log closure and marks them as logged to avoid duplicate stderr output. The process exits non-zero only after deferred context cancellation, database closure, request reporting, and log closure execute.

## App Root and Config

The app root determines where config, logs, cookies, and schedules live.

`[[main.go#resolveAppRootPath]]` uses `TMD_HOME` when set, otherwise `%APPDATA%\.tmd2` on Windows or `$HOME/.tmd2` elsewhere. Startup loads `conf.yaml` from this app root, applies supported `TMD_*` environment overrides, and exits after `-conf` interactive configuration.

Release binaries, Docker entrypoints, and user-facing command examples use the `tmdp` executable name. Existing `TMD_*` environment variables and `.tmd2` config paths remain compatibility interfaces.

Proxy setup is centralized in startup: `proxy_url` from config sets both `HTTP_PROXY` and `HTTPS_PROXY`; otherwise a single existing proxy environment variable is mirrored to the missing pair.

## Client Initialization

Twitter clients and the database are initialized once and injected downward.

`[[main.go#initializeClients]]` logs in the master Twitter client, enables rate limiting, loads `additional_cookies.yaml`, initializes the download store path, and opens the SQLite database. Initialization failures are returned as errors instead of terminating the process. CLI mode closes the DB directly; server mode delegates cleanup to graceful shutdown.

## CLI Argument Model

The CLI parser validates user-facing download flags before any service call is made.

`[[internal/cli/args.go#ParseArgs]]` defines download targets (`-user`, `-list`, `-foll`), profile targets, JSON import paths, and behavior flags. Screen names are normalized and deduplicated; list IDs must be positive and stay within `MaxNumericID`; `-mark-time` accepts `2006-01-02T15:04:05`, `null`, or `nil`.

Behavior flags map into [[service-layer#Download Options]]: `-auto-follow`, `-follow-members`, `-no-retry`, and `-noprofile`.

## CLI Task Selection

Task selection is intentionally ordered so mutually exclusive import and marking modes do not interleave with downloads.

`[[internal/cli/executor.go#Execute]]` dispatches in this priority order:

1. `-jsonfile`
2. `-jsonfolder`
3. `-mark-downloaded`
4. `-user` / `-list` / `-foll`
5. `-profile-user` / `-profile-list`

JSON import modes are fully exclusive. Mark-downloaded ignores profile flags. Batch media download can combine with profile download, but profile work runs only after the batch step succeeds.

## Runtime Notes

CLI mode is synchronous and uses the same service layer as the API server.

If no task flags are supplied, `Execute` logs a no-op hint and returns nil. A supplied `DownloadService` is used as-is for tests; otherwise the CLI creates one for the current run without mutating the dependencies object.

SIGINT/SIGTERM cancel the CLI context through `[[signal.go#notifyOnShutdownSignal]]`. The shared subscription restores default handling after the first signal so a second signal can force termination, while normal CLI completion invokes the same idempotent stop function.
