from __future__ import annotations

import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("tmd-db-migrate.py")
SPEC = importlib.util.spec_from_file_location("tmd_db_migrate", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load migration tool from {MODULE_PATH}")
MIGRATE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MIGRATE
SPEC.loader.exec_module(MIGRATE)


SCHEMA = """
CREATE TABLE user_entities (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    parent_dir TEXT NOT NULL COLLATE NOCASE,
    UNIQUE(user_id, parent_dir)
);
CREATE TABLE lst_entities (
    id INTEGER PRIMARY KEY,
    lst_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    parent_dir TEXT NOT NULL COLLATE NOCASE,
    UNIQUE(lst_id, parent_dir)
);
CREATE TABLE entity_removal_journal (
    staged_path TEXT PRIMARY KEY,
    original_path TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


class PortablePathTests(unittest.TestCase):
    def test_windows_drive_remap_is_case_insensitive(self) -> None:
        source = MIGRATE.parse_portable_path(r"F:\twitter_dl")
        target = MIGRATE.parse_portable_path("/data")

        value, changed = MIGRATE.remap_parent_dir(
            r"f:\Twitter_DL\users", source, target
        )

        self.assertTrue(changed)
        self.assertEqual("/data/users", value)

    def test_unc_and_posix_paths_keep_platform_semantics(self) -> None:
        unc_source = MIGRATE.parse_portable_path(r"\\server\share\twitter_dl")
        windows_target = MIGRATE.parse_portable_path(r"D:\archive")
        value, changed = MIGRATE.remap_parent_dir(
            r"\\SERVER\SHARE\Twitter_DL\users", unc_source, windows_target
        )
        self.assertTrue(changed)
        self.assertEqual(r"D:\archive\users", value)

        posix_source = MIGRATE.parse_portable_path("/Data")
        posix_target = MIGRATE.parse_portable_path("/mnt/archive")
        value, changed = MIGRATE.remap_parent_dir(
            "/data/users", posix_source, posix_target
        )
        self.assertFalse(changed)
        self.assertEqual("/data/users", value)

    def test_unc_paths_normalize_parent_segments_before_matching(self) -> None:
        source = MIGRATE.parse_portable_path(r"\\server\share\root")
        target = MIGRATE.parse_portable_path("/data")

        value, changed = MIGRATE.remap_parent_dir(
            r"\\server\share\root\nested\..\users", source, target
        )

        self.assertTrue(changed)
        self.assertEqual("/data/users", value)

    def test_relative_paths_are_not_rewritten(self) -> None:
        value, changed = MIGRATE.remap_parent_dir(
            "users",
            MIGRATE.parse_portable_path("/data"),
            MIGRATE.parse_portable_path("/archive"),
        )

        self.assertFalse(changed)
        self.assertEqual("users", value)


class DatabaseMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "foo.db"
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.executescript(SCHEMA)
            connection.commit()

    def execute(self, statement: str, parameters: tuple[object, ...] = ()) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(statement, parameters)
            connection.commit()

    def scalar(self, db_path: Path, statement: str) -> object:
        with closing(sqlite3.connect(db_path)) as connection:
            row = connection.execute(statement).fetchone()
        if row is None:
            raise AssertionError("query returned no rows")
        return row[0]

    def seed_complete_fixture(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                "INSERT INTO user_entities(id, user_id, name, parent_dir) "
                "VALUES(1, 10, 'user', ?)",
                (r"F:\twitter_dl\users",),
            )
            connection.execute(
                "INSERT INTO lst_entities(id, lst_id, name, parent_dir) "
                "VALUES(1, 20, 'list', ?)",
                (r"F:\twitter_dl",),
            )
            connection.execute(
                "INSERT INTO entity_removal_journal(staged_path, original_path) "
                "VALUES(?, ?)",
                (
                    r"F:\twitter_dl\.tmd-remove-v1-fixture",
                    r"F:\twitter_dl\legacy",
                ),
            )
            connection.commit()

    def test_dry_run_is_read_only_and_reports_all_path_tables(self) -> None:
        self.seed_complete_fixture()

        result = MIGRATE.migrate_parent_dirs_in_sqlite_file(
            str(self.db_path), r"F:\twitter_dl", "/data", dry_run=True
        )

        self.assertEqual(1, result.user_entities_updated)
        self.assertEqual(1, result.lst_entities_updated)
        self.assertEqual(1, result.removal_journals_updated)
        self.assertEqual(
            r"F:\twitter_dl\users",
            self.scalar(self.db_path, "SELECT parent_dir FROM user_entities"),
        )
        self.assertFalse(list(self.db_path.parent.glob("foo.db.backup.*")))

    def test_apply_uses_consistent_backup_and_migrates_recovery_paths(self) -> None:
        self.seed_complete_fixture()

        result = MIGRATE.migrate_parent_dirs_in_sqlite_file(
            str(self.db_path), r"F:\twitter_dl", "/data"
        )

        backup_path = Path(result.backup_path)
        self.assertTrue(backup_path.is_file())
        self.assertEqual(
            "/data/users",
            self.scalar(self.db_path, "SELECT parent_dir FROM user_entities"),
        )
        self.assertEqual(
            "/data",
            self.scalar(self.db_path, "SELECT parent_dir FROM lst_entities"),
        )
        self.assertEqual(
            "/data/.tmd-remove-v1-fixture",
            self.scalar(
                self.db_path,
                "SELECT staged_path FROM entity_removal_journal",
            ),
        )
        self.assertEqual(
            r"F:\twitter_dl\users",
            self.scalar(backup_path, "SELECT parent_dir FROM user_entities"),
        )

        second = MIGRATE.migrate_parent_dirs_in_sqlite_file(
            str(self.db_path), r"F:\twitter_dl", "/data"
        )
        self.assertEqual("", second.backup_path)

    def test_legacy_database_without_removal_journal_still_migrates(self) -> None:
        self.execute("DROP TABLE entity_removal_journal")
        self.execute(
            "INSERT INTO user_entities(id, user_id, name, parent_dir) "
            "VALUES(1, 10, 'legacy', ?)",
            (r"F:\twitter_dl\users",),
        )

        result = MIGRATE.migrate_parent_dirs_in_sqlite_file(
            str(self.db_path), r"F:\twitter_dl", "/data"
        )

        self.assertEqual(1, result.user_entities_updated)
        self.assertEqual(0, result.removal_journals_total)
        self.assertEqual(
            "/data/users",
            self.scalar(self.db_path, "SELECT parent_dir FROM user_entities"),
        )

    def test_conflict_fails_before_backup_or_write(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                "INSERT INTO user_entities(id, user_id, name, parent_dir) "
                "VALUES(1, 10, 'old', ?)",
                (r"F:\twitter_dl\users",),
            )
            connection.execute(
                "INSERT INTO user_entities(id, user_id, name, parent_dir) "
                "VALUES(2, 10, 'new', '/data/users')"
            )
            connection.commit()

        with self.assertRaisesRegex(MIGRATE.MigrationError, "duplicate owner/path"):
            MIGRATE.migrate_parent_dirs_in_sqlite_file(
                str(self.db_path), r"F:\twitter_dl", "/data"
            )

        self.assertEqual(
            r"F:\twitter_dl\users",
            self.scalar(
                self.db_path,
                "SELECT parent_dir FROM user_entities WHERE id=1",
            ),
        )
        self.assertFalse(list(self.db_path.parent.glob("foo.db.backup.*")))

    def test_split_recovery_journal_mapping_is_rejected(self) -> None:
        self.execute(
            "INSERT INTO entity_removal_journal(staged_path, original_path) "
            "VALUES(?, ?)",
            (r"F:\twitter_dl\.tmd-remove-v1-fixture", r"G:\other\entity"),
        )

        with self.assertRaisesRegex(MIGRATE.MigrationError, "must migrate together"):
            MIGRATE.migrate_parent_dirs_in_sqlite_file(
                str(self.db_path), r"F:\twitter_dl", "/data", dry_run=True
            )


if __name__ == "__main__":
    unittest.main()
