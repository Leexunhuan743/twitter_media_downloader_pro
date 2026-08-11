#!/usr/bin/env python3
"""Rewrite historical parent_dir roots in a TMD foo.db database.

Usage:
  python tools/tmd-db-migrate.py -db <foo.db> -from-root <old-root> \
      -to-root <new-root> [-dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path


SQLITE_BUSY_TIMEOUT_MS = 30_000
MAX_SAMPLES = 10


class MigrationError(Exception):
    """Raised when the database cannot be migrated safely."""


@dataclass(frozen=True)
class PortablePath:
    style: str
    absolute: bool
    volume_id: str = ""
    root_prefix: str = ""
    segments: tuple[str, ...] = ()


@dataclass(frozen=True)
class MigrationSample:
    table: str
    row_id: int | str
    source: str
    target: str


@dataclass
class MigrationResult:
    backup_path: str = ""
    user_entities_total: int = 0
    user_entities_updated: int = 0
    lst_entities_total: int = 0
    lst_entities_updated: int = 0
    removal_journals_total: int = 0
    removal_journals_updated: int = 0
    samples: list[MigrationSample] = field(default_factory=list)


@dataclass(frozen=True)
class ParentDirUpdate:
    row_id: int
    source_parent_dir: str
    target_parent_dir: str


@dataclass(frozen=True)
class RemovalJournalUpdate:
    source_staged_path: str
    source_original_path: str
    target_staged_path: str
    target_original_path: str


def _clean_segments(parts: list[str]) -> tuple[str, ...]:
    return tuple(part for part in parts if part not in ("", "."))


def _clean_portable_segments(raw: str, absolute: bool) -> tuple[str, ...]:
    normalized = raw.replace("\\", "/")
    if absolute:
        normalized = "/" + normalized.lstrip("/")
    normalized = posixpath.normpath(normalized)
    if absolute:
        normalized = normalized.lstrip("/")
    if normalized in ("", "."):
        return ()
    return _clean_segments(normalized.split("/"))


def parse_portable_path(raw: str) -> PortablePath:
    value = raw.strip()
    if not value:
        raise MigrationError("path is empty")

    if value.startswith(("\\\\", "//")):
        normalized = value.replace("\\", "/")
        if normalized.startswith("//"):
            normalized = normalized[2:]
        if normalized.startswith("/"):
            normalized = normalized[1:]
        parts = tuple(part for part in normalized.split("/") if part)
        if len(parts) < 2 or parts[0] in (".", "..") or parts[1] in (".", ".."):
            raise MigrationError(
                f'UNC path "{raw}" is missing host/share components'
            )
        host, share = parts[:2]
        return PortablePath(
            style="windows",
            absolute=True,
            volume_id=f"{host}/{share}".lower(),
            root_prefix=f"\\\\{host}\\{share}",
            segments=_clean_portable_segments("/".join(parts[2:]), True),
        )

    if len(value) >= 2 and value[0].isascii() and value[0].isalpha() and value[1] == ":":
        normalized = value.replace("\\", "/")
        absolute = len(normalized) >= 3 and normalized[2] == "/"
        remainder = normalized[2:]
        return PortablePath(
            style="windows",
            absolute=absolute,
            volume_id=normalized[:2].lower(),
            root_prefix=normalized[0].upper() + ":",
            segments=_clean_portable_segments(remainder, True),
        )

    if "\\" in value:
        return PortablePath(
            style="windows",
            absolute=False,
            segments=_clean_portable_segments(value, False),
        )

    if value.startswith("/"):
        return PortablePath(
            style="posix",
            absolute=True,
            volume_id="/",
            root_prefix="/",
            segments=_clean_portable_segments(value, True),
        )

    return PortablePath(
        style="posix",
        absolute=False,
        segments=_clean_portable_segments(value, False),
    )


def _trim_portable_prefix(
    candidate: PortablePath, root: PortablePath
) -> tuple[str, ...] | None:
    if (
        candidate.style != root.style
        or not candidate.absolute
        or not root.absolute
        or candidate.volume_id != root.volume_id
        or len(candidate.segments) < len(root.segments)
    ):
        return None

    for candidate_segment, root_segment in zip(candidate.segments, root.segments):
        if candidate.style == "windows":
            if candidate_segment.casefold() != root_segment.casefold():
                return None
        elif candidate_segment != root_segment:
            return None

    return candidate.segments[len(root.segments) :]


def build_portable_path(root: PortablePath, remainder: tuple[str, ...]) -> str:
    segments = root.segments + remainder
    if root.style == "windows":
        if not segments:
            if root.root_prefix.startswith("\\\\"):
                return root.root_prefix
            return root.root_prefix + "\\"
        return root.root_prefix + "\\" + "\\".join(segments)
    if not segments:
        return "/"
    return "/" + "/".join(segments)


def remap_parent_dir(
    parent_dir: str, from_root: PortablePath, to_root: PortablePath
) -> tuple[str, bool]:
    if not parent_dir.strip():
        return parent_dir, False

    current = parse_portable_path(parent_dir)
    if not current.absolute:
        return parent_dir, False

    remainder = _trim_portable_prefix(current, from_root)
    if remainder is None:
        return parent_dir, False
    return build_portable_path(to_root, remainder), True


def _collect_updates(
    connection: sqlite3.Connection,
    query: str,
    table: str,
    from_root: PortablePath,
    to_root: PortablePath,
    samples: list[MigrationSample],
) -> tuple[int, list[ParentDirUpdate]]:
    try:
        rows = connection.execute(query).fetchall()
    except sqlite3.Error as error:
        raise MigrationError(
            f"failed to read {table} parent_dir values: {error}"
        ) from error

    updates: list[ParentDirUpdate] = []
    desired_keys: dict[str, int] = {}
    for row_id, owner_id, parent_dir in rows:
        target, changed = remap_parent_dir(parent_dir, from_root, to_root)
        if changed:
            updates.append(
                ParentDirUpdate(
                    row_id=row_id,
                    source_parent_dir=parent_dir,
                    target_parent_dir=target,
                )
            )
            if len(samples) < MAX_SAMPLES:
                samples.append(
                    MigrationSample(
                        table=table,
                        row_id=row_id,
                        source=parent_dir,
                        target=target,
                    )
                )

        key = f"{owner_id}|{target.lower()}"
        existing_id = desired_keys.get(key)
        if existing_id is not None and existing_id != row_id:
            raise MigrationError(
                f"{table} migration would create duplicate owner/path pair: "
                f"owner={owner_id} existing_id={existing_id} "
                f'conflicting_id={row_id} parent_dir="{target}"'
            )
        desired_keys[key] = row_id

    return len(rows), updates


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    try:
        row = connection.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    except sqlite3.Error as error:
        raise MigrationError(
            f'failed to inspect table "{table}": {error}'
        ) from error
    return bool(row and row[0])


def _collect_removal_journal_updates(
    connection: sqlite3.Connection,
    from_root: PortablePath,
    to_root: PortablePath,
    samples: list[MigrationSample],
) -> tuple[int, list[RemovalJournalUpdate]]:
    if not _table_exists(connection, "entity_removal_journal"):
        return 0, []

    try:
        rows = connection.execute(
            "SELECT staged_path, original_path "
            "FROM entity_removal_journal ORDER BY staged_path"
        ).fetchall()
    except sqlite3.Error as error:
        raise MigrationError(
            f"failed to read entity_removal_journal paths: {error}"
        ) from error

    updates: list[RemovalJournalUpdate] = []
    desired_staged_paths: dict[str, str] = {}
    for staged_path, original_path in rows:
        target_staged, staged_changed = remap_parent_dir(
            staged_path, from_root, to_root
        )
        target_original, original_changed = remap_parent_dir(
            original_path, from_root, to_root
        )
        if staged_changed != original_changed:
            raise MigrationError(
                "entity_removal_journal paths must migrate together: "
                f'staged_path="{staged_path}" original_path="{original_path}"'
            )
        if staged_changed:
            updates.append(
                RemovalJournalUpdate(
                    source_staged_path=staged_path,
                    source_original_path=original_path,
                    target_staged_path=target_staged,
                    target_original_path=target_original,
                )
            )
            if len(samples) < MAX_SAMPLES:
                samples.append(
                    MigrationSample(
                        table="entity_removal_journal",
                        row_id=staged_path,
                        source=original_path,
                        target=target_original,
                    )
                )

        key = target_staged.casefold()
        existing_path = desired_staged_paths.get(key)
        if existing_path is not None and existing_path != staged_path:
            raise MigrationError(
                "entity_removal_journal migration would create duplicate "
                f'staged_path values: "{existing_path}" and "{staged_path}"'
            )
        desired_staged_paths[key] = staged_path

    return len(rows), updates


def _reserve_backup_path(db_path: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    base = db_path + ".backup." + timestamp
    for attempt in range(100):
        candidate = base if attempt == 0 else f"{base}.{attempt}"
        try:
            descriptor = os.open(candidate, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            continue
        except OSError as error:
            raise MigrationError(
                f'failed to reserve backup path "{candidate}": {error}'
            ) from error
        os.close(descriptor)
        return candidate
    raise MigrationError("failed to reserve a unique database backup path")


def _readonly_database_uri(db_path: str) -> str:
    return Path(db_path).resolve().as_uri() + "?mode=ro"


def backup_sqlite_database(db_path: str) -> str:
    backup_path = _reserve_backup_path(db_path)
    source: sqlite3.Connection | None = None
    destination: sqlite3.Connection | None = None
    try:
        source = sqlite3.connect(
            _readonly_database_uri(db_path),
            uri=True,
            timeout=SQLITE_BUSY_TIMEOUT_MS / 1000,
        )
        destination = sqlite3.connect(backup_path)
        source.backup(destination)
        destination.close()
        destination = None
        source.close()
        source = None
        os.chmod(backup_path, 0o600)
        with open(backup_path, "r+b") as backup_file:
            os.fsync(backup_file.fileno())
        return backup_path
    except (OSError, sqlite3.Error) as error:
        if destination is not None:
            destination.close()
            destination = None
        if source is not None:
            source.close()
            source = None
        try:
            os.unlink(backup_path)
        except FileNotFoundError:
            pass
        except OSError:
            pass
        raise MigrationError(
            f'failed to create SQLite backup "{backup_path}": {error}'
        ) from error
    finally:
        if destination is not None:
            destination.close()
        if source is not None:
            source.close()


def _apply_updates(
    connection: sqlite3.Connection, table: str, updates: list[ParentDirUpdate]
) -> None:
    statement = f"UPDATE {table} SET parent_dir=? WHERE id=? AND parent_dir=?"
    for update in updates:
        try:
            cursor = connection.execute(
                statement,
                (
                    update.target_parent_dir,
                    update.row_id,
                    update.source_parent_dir,
                ),
            )
        except sqlite3.Error as error:
            raise MigrationError(
                f"failed to update {table} id={update.row_id} "
                f'parent_dir to "{update.target_parent_dir}": {error}'
            ) from error
        if cursor.rowcount != 1:
            raise MigrationError(
                f"{table} id={update.row_id} changed while migration was running"
            )


def _apply_removal_journal_updates(
    connection: sqlite3.Connection, updates: list[RemovalJournalUpdate]
) -> None:
    statement = (
        "UPDATE entity_removal_journal "
        "SET staged_path=?, original_path=? "
        "WHERE staged_path=? AND original_path=?"
    )
    for update in updates:
        try:
            cursor = connection.execute(
                statement,
                (
                    update.target_staged_path,
                    update.target_original_path,
                    update.source_staged_path,
                    update.source_original_path,
                ),
            )
        except sqlite3.Error as error:
            raise MigrationError(
                "failed to update entity_removal_journal "
                f'staged_path="{update.source_staged_path}": {error}'
            ) from error
        if cursor.rowcount != 1:
            raise MigrationError(
                "entity_removal_journal changed while migration was running: "
                f'staged_path="{update.source_staged_path}"'
            )


def _collect_migration_plan(
    connection: sqlite3.Connection,
    from_root: PortablePath,
    to_root: PortablePath,
) -> tuple[MigrationResult, list[ParentDirUpdate], list[ParentDirUpdate], list[RemovalJournalUpdate]]:
    result = MigrationResult()
    user_total, user_updates = _collect_updates(
        connection,
        "SELECT id, user_id AS owner_id, parent_dir FROM user_entities ORDER BY id",
        "user_entities",
        from_root,
        to_root,
        result.samples,
    )
    list_total, list_updates = _collect_updates(
        connection,
        "SELECT id, lst_id AS owner_id, parent_dir FROM lst_entities ORDER BY id",
        "lst_entities",
        from_root,
        to_root,
        result.samples,
    )
    journal_total, journal_updates = _collect_removal_journal_updates(
        connection, from_root, to_root, result.samples
    )
    result.user_entities_total = user_total
    result.user_entities_updated = len(user_updates)
    result.lst_entities_total = list_total
    result.lst_entities_updated = len(list_updates)
    result.removal_journals_total = journal_total
    result.removal_journals_updated = len(journal_updates)
    return result, user_updates, list_updates, journal_updates


def migrate_parent_dirs_in_sqlite_file(
    db_path: str, from_root_raw: str, to_root_raw: str, dry_run: bool = False
) -> MigrationResult:
    if not db_path.strip():
        raise MigrationError("db path is required")
    if not Path(db_path).exists():
        raise MigrationError(f'database file "{db_path}" does not exist')

    try:
        from_root = parse_portable_path(from_root_raw)
    except MigrationError as error:
        raise MigrationError(f'invalid from-root "{from_root_raw}": {error}') from error
    if not from_root.absolute:
        raise MigrationError(f'from-root "{from_root_raw}" must be absolute')

    try:
        to_root = parse_portable_path(to_root_raw)
    except MigrationError as error:
        raise MigrationError(f'invalid to-root "{to_root_raw}": {error}') from error
    if not to_root.absolute:
        raise MigrationError(f'to-root "{to_root_raw}" must be absolute')

    try:
        if dry_run:
            connection = sqlite3.connect(
                _readonly_database_uri(db_path),
                uri=True,
                timeout=SQLITE_BUSY_TIMEOUT_MS / 1000,
                isolation_level=None,
            )
        else:
            connection = sqlite3.connect(
                db_path,
                timeout=SQLITE_BUSY_TIMEOUT_MS / 1000,
                isolation_level=None,
            )
    except sqlite3.Error as error:
        raise MigrationError(f'failed to connect to database at "{db_path}": {error}') from error

    try:
        connection.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        if not dry_run:
            connection.execute("BEGIN IMMEDIATE")

        result, user_updates, list_updates, journal_updates = _collect_migration_plan(
            connection, from_root, to_root
        )
        has_updates = bool(user_updates or list_updates or journal_updates)
        if dry_run:
            return result
        if not has_updates:
            connection.execute("COMMIT")
            return result

        result.backup_path = backup_sqlite_database(db_path)
        try:
            _apply_updates(connection, "user_entities", user_updates)
            _apply_updates(connection, "lst_entities", list_updates)
            _apply_removal_journal_updates(connection, journal_updates)
            connection.execute("COMMIT")
        except Exception:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        return result
    except MigrationError:
        raise
    except sqlite3.Error as error:
        raise MigrationError(str(error)) from error
    finally:
        connection.close()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tmd-db-migrate",
        usage=(
            "%(prog)s -db <foo.db> -from-root <old-root> "
            "-to-root <new-root> [-dry-run]"
        ),
    )
    parser.add_argument("-db", "--db", required=True, help="path to foo.db")
    parser.add_argument(
        "-from-root",
        "--from-root",
        required=True,
        help="existing download root recorded in parent_dir values",
    )
    parser.add_argument(
        "-to-root",
        "--to-root",
        required=True,
        help="new download root to rewrite parent_dir values to",
    )
    parser.add_argument(
        "-dry-run",
        "--dry-run",
        action="store_true",
        help="report changes without writing the database",
    )
    return parser


def run(args: list[str]) -> int:
    options = _build_parser().parse_args(args)
    try:
        result = migrate_parent_dirs_in_sqlite_file(
            options.db,
            options.from_root,
            options.to_root,
            options.dry_run,
        )
    except MigrationError as error:
        print(f"migration failed: {error}", file=sys.stderr)
        return 1

    print(f"dry_run={str(options.dry_run).lower()}")
    print(
        "user_entities: "
        f"{result.user_entities_updated}/{result.user_entities_total} updated"
    )
    print(
        "lst_entities: "
        f"{result.lst_entities_updated}/{result.lst_entities_total} updated"
    )
    print(
        "entity_removal_journal: "
        f"{result.removal_journals_updated}/{result.removal_journals_total} updated"
    )
    if result.backup_path:
        print(f"backup={result.backup_path}")
    if result.samples:
        print("samples:")
        for sample in result.samples:
            print(
                f'- {sample.table} id={sample.row_id}: '
                f'{json.dumps(sample.source, ensure_ascii=False)} -> '
                f'{json.dumps(sample.target, ensure_ascii=False)}'
            )
    if (
        result.user_entities_updated == 0
        and result.lst_entities_updated == 0
        and result.removal_journals_updated == 0
    ):
        print("no changes required")
    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:]))
