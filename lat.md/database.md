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
- New names must be non-empty portable path components; [[internal/entity/storage.go#ValidateName]] rejects traversal, separators, absolute paths, control characters, Windows-invalid characters, trailing spaces/dots, DOS device names, and the internal `.tmd-remove-` prefix before filesystem changes. [[internal/entity/storage.go#storedEntityPath]] accepts only persisted trailing-space/dot legacy names as existing sources while retaining containment checks; Windows maps that suffix to the canonical addressable path so migration and removal cannot wedge. An empty persisted name is intentionally not addressable: sync creates or adopts the validated replacement directory and name-only CAS updates the row, while remove deletes only that row and never treats its parent as an entity directory.
- Create, rename, and remove are serialized per entity type, stable owner id, and normalized parent directory by [[internal/entity/operation_lock.go#lockEntityOperation]]. They additionally hold [[internal/entity/operation_lock.go#lockEntityStorageParent]] across ownership checks, filesystem mutation, and the database write, so two different owners in the same process cannot pass a same-parent target check concurrently. Recorded operations refresh the row after acquiring those locks, so a stale in-memory instance acts on the current directory name.
- Create and rename roll back newly created or moved directories when the database write fails. Rename refuses to overwrite a different existing target with `ErrPathConflict` when the source directory still exists. When the source directory is missing and the target already exists (an interrupted earlier rename whose database commit was lost, or a manually placed directory — indistinguishable at the filesystem level), rename adopts the existing target and commits the name-only CAS so the entity converges instead of wedging permanently on `ErrPathConflict`.
- Create and rename check directory ownership via [[internal/entity/storage.go#entityDirectoryOwnedByAnother]] before committing: a target whose normalized path (legacy trailing dots/spaces on Windows, case variants) is already claimed by another entity's record is rejected even when that directory is currently missing, preventing two records from sharing one directory (mixed media). Rename's ownership check complements the `ErrPathConflict` guard for the directory-missing window.
- Rename commits through [[internal/database/user_entity.go#UpdateUserEntityNameIfCurrent]] or [[internal/database/lst_entity.go#UpdateLstEntityNameIfCurrent]]. Name-only compare-and-swap updates never overwrite latest-release-time or media-count changes. Same-process operations for one entity are serialized; HTTP 409 is reserved for target conflicts or stale writes from outside that lock domain.
- Remove first records the staged sibling name and the original path in `entity_removal_journal` **before** renaming the directory, so any stage this program creates already has a journal row; it then renames the directory to that staged sibling and finally deletes the entity row, which is the commit point. It restores the directory if the database delete fails and permanently removes the stage only after the entity row is gone. Startup reconciliation scans configured, active, and journal-recorded parents: journaled stages whose record still exists are restored, committed deletions are removed, stale journal rows whose staged directory no longer exists are dropped (the crash window left by the journal-first order), and every unjournaled stage is retained for manual inspection rather than recursively deleted. User/list entity DELETE API handlers use this lifecycle and therefore delete the corresponding storage directory, not only its database row; deleting a user/list cascades through its entities first so no orphan media directory remains.
- Startup reconciliation is cross-platform safe: journaled stages match active records through both trailing-suffix variants, so a stage created on one platform (Windows normalizes trailing dots/spaces, other platforms store them verbatim) still matches the same record scanned on another. The journal is the only ownership proof, so every unjournaled stage — including pre-release `.tmd-remove-v1-<hash>` names — is retained with a startup warning rather than recursively deleted. The `.tmd-remove-` prefix check is case-insensitive.
- List entity database deletion removes dependent `user_links` in the same transaction even when SQLite foreign-key enforcement is disabled; a missing list entity rolls the link deletion back.
- User entity API metadata changes use [[internal/database/user_entity.go#UpdateUserEntityMetadata]] to update only requested statistics in one SQL statement, then perform any requested directory rename last. Missing rows return 404; target/name races return 409.
- Database update helpers treat zero affected rows as an error so a missing record cannot make a filesystem change appear committed.
- Entity-layer mutations translate database sentinels at the package boundary: [[internal/entity/errors.go#TranslateError]] maps `database.ErrEntityNotFound` onto `entity.ErrNotFound`, so callers match a single sentinel — the API 404 mapping checks `entity.ErrNotFound` only.

`UserEntity` additionally owns latest-release-time and media-count state. Profile directory synchronization and API entity-name edits route through the same entity lifecycle rather than issuing independent filesystem and database mutations.

Database API responses serialize valid latest-release times as UTC RFC3339 values. Web2 and Web3 use the executable shared helper in `web/shared/datetime.js` to convert that absolute instant to `datetime-local` only for editing, then convert the user's local value back to UTC RFC3339 on PATCH.

`latest_release_time` values are stored in UTC on every write path (mark, batch statistics, API PATCH), because SQLite compares TEXT values lexically and mixed zone offsets would make `MAX()` comparisons keep an older baseline. [[internal/database/timestamps.go#NormalizeLegacyTimestamps]] rewrites values stored by older versions with a non-UTC offset into UTC at startup (after schema migration, before validation), so the stored text order equals the instant order. The service mark-time parser ([[internal/downloading/mark_downloaded.go#ParseMarkTimeValue]]) accepts RFC3339 (absolute instant) or a zone-less local wall clock for CLI compatibility, and treats `null`/`nil` as the full-mark sentinel.

## Migrations

`schema.go:MigrateDatabase()` handles repeatable in-place `ALTER TABLE ADD COLUMN` and `RENAME COLUMN` statements for schema upgrades.

`sqlite_migration.go:migrateExistingDatabase()` handles full backup-and-rebuild for legacy databases created by older SQLite drivers, then copies all data into the new schema. `Connect` first invokes [[internal/database/sqlite_migration.go#recoverInterruptedSQLiteReplacement]]: when the main file is absent but `.replacing` still holds the original, it restores that original; when only an uncommitted `.migrating` file remains, startup fails closed instead of letting SQLite create an empty database. This compatibility path can be removed after all users have migrated.

`[[internal/database/schema.go#CreateTables]]` adds `entity_removal_journal` in place for existing readable databases and returns an error (never panics) when table/index creation fails on a read-only database, full disk, or index conflict — `Connect` closes the handle and propagates a startup error with the path context. If an unrelated legacy schema requires a full rebuild, the migration copies any existing journal rows so filesystem recovery evidence is not lost.

[[tools/tmd-db-migrate.py#migrate_parent_dirs_in_sqlite_file]] is the standalone Python tool for previewing and applying historical storage-root rewrites. Dry runs use a read-only connection; writes hold an immediate transaction, create a SQLite-consistent non-overwriting backup, compare old values before updating, and migrate removal-journal paths together. `tools/test_tmd_db_migrate.py` covers path styles, backups, conflicts, and journal invariants.

## TweetDumper (Failure Recorder)

Persists failed tweet IDs to JSON files so they can be retried in future runs.

Groups failures by entity ID (regular) or source path (JSON import). Dumper is loaded at start and dumped after each download round. Protected by `sync.Mutex` at the service layer.

## User Sync

`database/user_sync.go:SyncUser()` detects screen_name/name changes and records old names in `user_previous_names`. The filesystem directory rename is handled by `entity/sync.go` → `UserEntity.Rename()`.
