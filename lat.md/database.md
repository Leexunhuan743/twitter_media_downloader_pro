# Database

SQLite database using `modernc.org/sqlite` (pure Go, CGO_ENABLED=0). Located at `{rootPath}/.data/foo.db`. Single connection pool (max 1 open), WAL mode.

## Schema (6 Tables)
Six tables store users, lists, entities, and their relationships.

```
users (id, screen_name, name, protected, friends_count, is_accessible)
user_previous_names (id, user_id, screen_name, name, record_date)
lsts (id, name, owner_user_id)
lst_entities (id, lst_id, name, parent_dir)           -- UNIQUE(lst_id, parent_dir)
user_entities (id, user_id, name, latest_release_time, parent_dir, media_count)
user_links (id, user_id, name, parent_lst_entity_id)
```

## Entity Relationships
The schema expresses several one-to-many relationships between core entities.

```
users ──1:N── user_entities (same user, different parent dirs)
users ──1:N── user_previous_names (rename history)
lsts ──1:N── lst_entities (same list, different parent dirs)
lst_entities ──1:N── user_links (list member symlinks)
user_entities ──1:N── user_links (user symlinked into lists)
```

## UserEntity

Domain model wrapping `database.UserEntity`. Provides:
- **Path**: `{parent_dir}/{name}` on filesystem
- **Lifecycle**: Create/Rename/Remove — filesystem + DB transactionally
- **Time tracking**: `LatestReleaseTime / SetLatestReleaseTime / ClearLatestReleaseTime`
- **Media stats**: `MediaCount / MediaCountValid`

## Migrations

Implemented in `sqlite_migration.go` — repeatable `ALTER TABLE ADD COLUMN` and `RENAME COLUMN` statements. A `parent_dir_migration.go` handles historical path migration for directory renames.

## TweetDumper (Failure Recorder)

Persists failed tweet IDs to JSON files so they can be retried in future runs.

Groups failures by entity ID (regular) or source path (JSON import). Dumper is loaded at start and dumped after each download round. Protected by `sync.Mutex` at the service layer.
## User Sync

Detects screen_name changes and records rename history in `user_previous_names`.

`database/user_sync.go` detects screen_name changes, records old names in `user_previous_names`, and renames the filesystem directory accordingly.
