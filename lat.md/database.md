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
users ──1:N── user_links (user symlinked into lists, FK: user_links.user_id → users.id)

## UserEntity

Domain model wrapping `database.UserEntity`. Provides:
- **Path**: `{parent_dir}/{name}` on filesystem
- **Lifecycle**: Create/Rename/Remove — filesystem + DB transactionally
- **Time tracking**: `LatestReleaseTime / SetLatestReleaseTime / ClearLatestReleaseTime`
- **Media stats**: `MediaCount / MediaCountValid`

## Migrations

`schema.go:MigrateDatabase()` handles repeatable in-place `ALTER TABLE ADD COLUMN` and `RENAME COLUMN` statements for schema upgrades.

`sqlite_migration.go:migrateExistingDatabase()` handles full backup-and-rebuild for legacy databases created by older SQLite drivers, then copies all data into the new schema. This can be removed after all users have migrated.

`parent_dir_migration.go:MigrateParentDirsInSQLiteFile()` handles historical path migration for directory renames.
## TweetDumper (Failure Recorder)

Persists failed tweet IDs to JSON files so they can be retried in future runs.

Groups failures by entity ID (regular) or source path (JSON import). Dumper is loaded at start and dumped after each download round. Protected by `sync.Mutex` at the service layer.
## User Sync

`database/user_sync.go:SyncUser()` detects screen_name/name changes and records old names in `user_previous_names`. The filesystem directory rename is handled by `entity/sync.go` → `UserEntity.Rename()`.
