This directory defines the high-level concepts, business logic, and architecture of this project using markdown. It is managed by [lat.md](https://www.npmjs.com/package/lat.md) — a tool that anchors source code to these definitions. Install the `lat` command with `npm i -g lat.md` and run `lat --help`.

## Entries

List of all top-level sections in the knowledge graph.

- [[architecture]] — overall project structure, execution modes, data layout
- [[api-server]] — REST API, auth, Web UI, graceful shutdown
- [[service-layer]] — DownloadService interface and operations
- [[download-pipeline]] — batch download orchestration, single-file download, retry
- [[task-management]] — async task queue, state machine, SSE push
- [[twitter-api]] — Twitter GraphQL API, multi-account, rate limiting
- [[database]] — SQLite schema, migrations, TweetDumper
- [[scheduler]] — cron-like scheduled downloads
- [[development]] — logging conventions, concurrency model, testing
- [[bot-integration]] — bot platform interface, notification flow, download options
