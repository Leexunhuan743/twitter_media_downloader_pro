# Database

SQLite database using `modernc.org/sqlite` (pure Go, CGO_ENABLED=0). Located at `{rootPath}/.data/foo.db`. Single connection pool (max 1 open), WAL mode.

## Schema (7 Tables)
Six domain tables store users, lists, entities, and their relationships; one internal journal makes staged directory deletion recoverable across process crashes.

```
users (id, screen_name, name, protected, friends_count, is_accessible)
user_previous_names (id, user_id, screen_name, name, record_date)
lsts (id, name, owner_user_id)
lst_entities (id, lst_id, name, parent_dir)           -- UNIQUE(lst_id, parent_dir)
user_entities (id, user_id, name, latest_release_time, parent_dir, media_count)
user_links (id, user_id, name, parent_lst_entity_id)
entity_removal_journal (staged_path, original_path, created_at)
```

## Entity Relationships
The schema expresses several one-to-many relationships between core entities.

```
users ──1:N── user_entities (same user, different parent dirs)
users ──1:N── user_previous_names (rename history)
lsts ──1:N── lst_entities (same list, different parent dirs)
lst_entities ──1:N── user_links (list member symlinks)
users ──1:N── user_links (user symlinked into lists, FK: user_links.user_id → users.id)
```

## Entity Storage Lifecycle

User and list entity models keep database records and their filesystem directories consistent across lifecycle operations.

- [[internal/entity/user.go#NewUserEntity]] and [[internal/entity/list.go#NewListEntity]] require a database, normalize the parent to an absolute path, and return either a recorded entity or an unrecorded value ready for creation.
- New names must be non-empty portable path components; [[internal/entity/storage.go#ValidateName]] rejects traversal, separators, absolute paths, control characters, Windows-invalid characters, trailing spaces/dots, DOS device names, and the internal `.tmd-remove-` prefix before filesystem changes. [[internal/entity/storage.go#storedEntityPath]] accepts only persisted trailing-space/dot legacy names as existing sources while retaining containment checks; Windows maps that suffix to the canonical addressable path so migration and removal cannot wedge.
- Create, rename, and remove are serialized per entity type, stable owner id, and normalized parent directory by [[internal/entity/operation_lock.go#lockEntityOperation]]. Recorded operations refresh the row after acquiring that lock, so a stale in-memory instance acts on the current directory name.
- Create and rename roll back newly created or moved directories when the database write fails. Rename refuses to overwrite a different existing target with `ErrPathConflict`.
- Rename commits through [[internal/database/user_entity.go#UpdateUserEntityNameIfCurrent]] or [[internal/database/lst_entity.go#UpdateLstEntityNameIfCurrent]]. Name-only compare-and-swap updates never overwrite latest-release-time or media-count changes. Same-process operations for one entity are serialized; HTTP 409 is reserved for target conflicts or stale writes from outside that lock domain.
- Remove first moves the directory to a versioned sibling name and records both paths in `entity_removal_journal`. It restores the directory if the database delete fails and permanently removes the stage only after the entity row is gone. Startup reconciliation scans configured, active, and journal-recorded parents: active entities are restored, committed deletions are removed, stale journal rows are dropped, and ambiguous legacy stages remain untouched. The versioned name also carries a canonical basename hash so the pre-journal crash window can be restored safely. User/list entity DELETE API handlers use this lifecycle and therefore delete the corresponding storage directory, not only its database row.
- List entity database deletion removes dependent `user_links` in the same transaction even when SQLite foreign-key enforcement is disabled; a missing list entity rolls the link deletion back.
- User entity API metadata changes use [[internal/database/user_entity.go#UpdateUserEntityMetadata]] to update only requested statistics in one SQL statement, then perform any requested directory rename last. Missing rows return 404; target/name races return 409.
- Database update helpers treat zero affected rows as an error so a missing record cannot make a filesystem change appear committed.

`UserEntity` additionally owns latest-release-time and media-count state. Profile directory synchronization and API entity-name edits route through the same entity lifecycle rather than issuing independent filesystem and database mutations.

Database API responses serialize valid latest-release times as UTC RFC3339 values. Web2 and Web3 use the executable shared helper in `web/shared/datetime.js` to convert that absolute instant to `datetime-local` only for editing, then convert the user's local value back to UTC RFC3339 on PATCH.

## Migrations

`schema.go:MigrateDatabase()` handles repeatable in-place `ALTER TABLE ADD COLUMN` and `RENAME COLUMN` statements for schema upgrades.

`sqlite_migration.go:migrateExistingDatabase()` handles full backup-and-rebuild for legacy databases created by older SQLite drivers, then copies all data into the new schema. This can be removed after all users have migrated.

`CreateTables()` adds `entity_removal_journal` in place for existing readable databases. If an unrelated legacy schema requires a full rebuild, the migration copies any existing journal rows so filesystem recovery evidence is not lost.

[[tools/tmd-db-migrate.py#migrate_parent_dirs_in_sqlite_file]] is the standalone Python tool for previewing and applying historical storage-root rewrites. Dry runs use a read-only connection; writes hold an immediate transaction, create a SQLite-consistent non-overwriting backup, compare old values before updating, and migrate removal-journal paths together. `tools/test_tmd_db_migrate.py` covers path styles, backups, conflicts, and journal invariants.

## TweetDumper (Failure Recorder)

Persists failed tweet IDs to JSON files so they can be retried in future runs.

Groups failures by entity ID (regular) or source path (JSON import). Dumper is loaded at start and dumped after each download round. Protected by `sync.Mutex` at the service layer.

## User Sync

`database/user_sync.go:SyncUser()` detects screen_name/name changes and records old names in `user_previous_names`. The filesystem directory rename is handled by `entity/sync.go` → `UserEntity.Rename()`.
