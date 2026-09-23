from __future__ import annotations

import contextlib
import importlib.util
import io
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("convert_db_to_legacy.py")
SPEC = importlib.util.spec_from_file_location("convert_db_to_legacy", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load conversion tool from {MODULE_PATH}")
CONVERT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CONVERT
SPEC.loader.exec_module(CONVERT)


# 新版 tmd 结构（对应 internal/database/schema.go 的 schema），仅保留转换涉及的表。
NEW_SCHEMA = """
CREATE TABLE users (
    id INTEGER NOT NULL,
    screen_name VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    protected BOOLEAN NOT NULL,
    friends_count INTEGER NOT NULL,
    is_accessible BOOLEAN NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE (screen_name)
);
CREATE TABLE user_previous_names (
    id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    screen_name VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    record_date DATE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE lsts (
    id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    owner_user_id INTEGER NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE lst_entities (
    id INTEGER NOT NULL,
    lst_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    parent_dir VARCHAR NOT NULL COLLATE NOCASE,
    PRIMARY KEY (id),
    UNIQUE (lst_id, parent_dir)
);
CREATE TABLE user_entities (
    id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    latest_release_time DATETIME,
    parent_dir VARCHAR COLLATE NOCASE NOT NULL,
    media_count INTEGER,
    PRIMARY KEY (id),
    UNIQUE (user_id, parent_dir),
    FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE user_links (
    id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    parent_lst_entity_id INTEGER NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (user_id, parent_lst_entity_id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(parent_lst_entity_id) REFERENCES lst_entities (id)
);
"""

# 历史源库可能缺少 UNIQUE(screen_name)（旧版 users 仍有该约束）。
USERS_WITHOUT_UNIQUE = """
CREATE TABLE users (
    id INTEGER NOT NULL,
    screen_name VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    protected BOOLEAN NOT NULL,
    friends_count INTEGER NOT NULL,
    is_accessible BOOLEAN NOT NULL DEFAULT 1,
    PRIMARY KEY (id)
);
"""

# tmd-2.4.4 旧版结构（转换目标），列名与列序来自工具内的 LEGACY_SCHEMA。
EXPECTED_LEGACY_COLUMNS = {
    "users": ["id", "screen_name", "name", "protected", "friends_count"],
    "user_previous_names": ["id", "uid", "screen_name", "name", "record_date"],
    "lsts": ["id", "name", "owner_uid"],
    "lst_entities": ["id", "lst_id", "name", "parent_dir"],
    "user_entities": [
        "id",
        "user_id",
        "name",
        "latest_release_time",
        "parent_dir",
        "media_count",
    ],
    "user_links": ["id", "user_id", "name", "parent_lst_entity_id"],
}

EXPECTED_ROW_COUNTS = {
    "users": 2,
    "user_previous_names": 1,
    "lsts": 1,
    "lst_entities": 2,
    "user_entities": 2,
    "user_links": 1,
}


class ConvertToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.source_path = Path(self.temp_dir.name) / "new_tmd.db"
        self.target_path = Path(self.temp_dir.name) / "legacy_tmd.db"
        with closing(sqlite3.connect(self.source_path)) as connection:
            connection.executescript(NEW_SCHEMA)
            connection.commit()

    # ── helpers ────────────────────────────────────────────────
    def seed_new_format_fixture(self) -> None:
        with closing(sqlite3.connect(self.source_path)) as connection:
            connection.executemany(
                "INSERT INTO users(id, screen_name, name, protected, "
                "friends_count, is_accessible) VALUES(?,?,?,?,?,?)",
                [
                    (101, "alpha_user", "Alpha", 0, 7, 1),
                    (102, "beta_user", "Beta", 1, 3, 0),
                ],
            )
            connection.execute(
                "INSERT INTO user_previous_names(id, user_id, screen_name, name, "
                "record_date) VALUES(1, 101, 'alpha_old', 'Alpha Old', "
                "'2024-01-02T03:04:05Z')"
            )
            connection.execute(
                "INSERT INTO lsts(id, name, owner_user_id) VALUES(11, 'my_list', 101)"
            )
            connection.executemany(
                "INSERT INTO lst_entities(id, lst_id, name, parent_dir) "
                "VALUES(?,?,?,?)",
                [
                    (21, 11, "list_entity_one", r"D:\downloads\lists"),
                    (22, 11, "list_entity_two", r"D:\downloads\lists\extra"),
                ],
            )
            connection.executemany(
                "INSERT INTO user_entities(id, user_id, name, latest_release_time, "
                "parent_dir, media_count) VALUES(?,?,?,?,?,?)",
                [
                    (31, 101, "entity_one", "2024-05-06T07:08:09Z",
                     r"D:\downloads\users\alpha_user", 12),
                    (32, 102, "entity_two", None,
                     r"D:\downloads\users\beta_user", None),
                ],
            )
            connection.execute(
                "INSERT INTO user_links(id, user_id, name, parent_lst_entity_id) "
                "VALUES(41, 101, 'link_one', 21)"
            )
            connection.commit()

    def run_tool(self, args: list[str]) -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = CONVERT.run(args)
        return code, stdout.getvalue(), stderr.getvalue()

    def scalar(self, db_path: Path, statement: str) -> object:
        with closing(sqlite3.connect(db_path)) as connection:
            row = connection.execute(statement).fetchone()
        if row is None:
            raise AssertionError("query returned no rows")
        return row[0]

    def table_columns(self, db_path: Path, table: str) -> list[str]:
        with closing(sqlite3.connect(db_path)) as connection:
            rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
        return [row[1] for row in rows]

    def table_names(self, db_path: Path) -> set[str]:
        with closing(sqlite3.connect(db_path)) as connection:
            rows = connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        return {row[0] for row in rows}

    def backup_files(self) -> list[Path]:
        return sorted(Path(self.temp_dir.name).glob("legacy_tmd.db.backup.*"))

    # ── tests ──────────────────────────────────────────────────
    def test_dry_run_reports_plan_without_writing_any_file(self) -> None:
        self.seed_new_format_fixture()

        code, stdout, stderr = self.run_tool(
            [str(self.source_path), str(self.target_path), "--dry-run"]
        )

        self.assertEqual(0, code)
        self.assertEqual("", stderr)
        self.assertFalse(self.target_path.exists())
        self.assertEqual([], self.backup_files())
        for table, rows in EXPECTED_ROW_COUNTS.items():
            self.assertIn(f"{table}: {rows} 行", stdout)
        self.assertIn(str(self.target_path), stdout)
        self.assertIn("未创建、未覆盖任何文件", stdout)
        # 源库保持可读且未被改写
        self.assertEqual(
            2, self.scalar(self.source_path, "SELECT COUNT(*) FROM users")
        )

    def test_dry_run_reports_existing_target_without_touching_it(self) -> None:
        self.seed_new_format_fixture()
        self.target_path.write_bytes(b"sentinel-legacy-bytes")

        code, stdout, _ = self.run_tool(
            [str(self.source_path), str(self.target_path), "--dry-run"]
        )

        self.assertEqual(0, code)
        self.assertEqual(b"sentinel-legacy-bytes", self.target_path.read_bytes())
        self.assertEqual([], self.backup_files())
        self.assertIn("已存在", stdout)

    def test_existing_target_is_refused_without_force(self) -> None:
        self.seed_new_format_fixture()
        self.target_path.write_bytes(b"sentinel-legacy-bytes")

        code, _, stderr = self.run_tool([str(self.source_path), str(self.target_path)])

        self.assertEqual(1, code)
        self.assertIn("--force", stderr)
        self.assertEqual(b"sentinel-legacy-bytes", self.target_path.read_bytes())
        self.assertEqual([], self.backup_files())

    def test_force_overwrites_target_and_keeps_backup(self) -> None:
        self.seed_new_format_fixture()
        self.target_path.write_bytes(b"sentinel-legacy-bytes")

        code, stdout, stderr = self.run_tool(
            [str(self.source_path), str(self.target_path), "--force"]
        )

        self.assertEqual(0, code)
        self.assertEqual("", stderr)
        backups = self.backup_files()
        self.assertEqual(1, len(backups))
        self.assertEqual(b"sentinel-legacy-bytes", backups[0].read_bytes())
        self.assertIn(str(backups[0]), stdout)
        self.assertEqual(
            2, self.scalar(self.target_path, "SELECT COUNT(*) FROM users")
        )

    def test_missing_source_fails_without_creating_target(self) -> None:
        missing = Path(self.temp_dir.name) / "no_such.db"

        code, _, stderr = self.run_tool([str(missing), str(self.target_path)])

        self.assertEqual(1, code)
        self.assertIn("不存在", stderr)
        self.assertNotIn("Traceback", stderr)
        self.assertFalse(self.target_path.exists())

    def test_non_sqlite_source_is_rejected(self) -> None:
        not_a_db = Path(self.temp_dir.name) / "plain.db"
        not_a_db.write_bytes(b"this is not a sqlite database at all")

        code, _, stderr = self.run_tool([str(not_a_db), str(self.target_path)])

        self.assertEqual(1, code)
        self.assertIn("SQLite", stderr)
        self.assertNotIn("Traceback", stderr)
        self.assertFalse(self.target_path.exists())

    def test_source_equal_to_target_is_rejected(self) -> None:
        self.seed_new_format_fixture()

        code, _, stderr = self.run_tool(
            [str(self.source_path), str(self.source_path), "--force"]
        )

        self.assertEqual(1, code)
        self.assertIn("同一个文件", stderr)
        self.assertEqual(
            2, self.scalar(self.source_path, "SELECT COUNT(*) FROM users")
        )
        self.assertEqual([], self.backup_files())

    def test_conversion_matches_legacy_schema_and_row_counts(self) -> None:
        self.seed_new_format_fixture()

        code, _, stderr = self.run_tool([str(self.source_path), str(self.target_path)])

        self.assertEqual(0, code)
        self.assertEqual("", stderr)
        self.assertEqual(set(EXPECTED_LEGACY_COLUMNS), self.table_names(self.target_path))
        for table, columns in EXPECTED_LEGACY_COLUMNS.items():
            self.assertEqual(columns, self.table_columns(self.target_path, table))
            self.assertEqual(
                EXPECTED_ROW_COUNTS[table],
                self.scalar(self.target_path, f"SELECT COUNT(*) FROM {table}"),
            )
            self.assertEqual(
                EXPECTED_ROW_COUNTS[table],
                self.scalar(self.source_path, f"SELECT COUNT(*) FROM {table}"),
            )

        # 列重命名后的取值必须与源库对应列一致
        self.assertEqual(
            101,
            self.scalar(
                self.target_path,
                "SELECT uid FROM user_previous_names WHERE id=1",
            ),
        )
        self.assertEqual(
            101, self.scalar(self.target_path, "SELECT owner_uid FROM lsts WHERE id=11")
        )
        self.assertEqual(
            r"D:\downloads\users\alpha_user",
            self.scalar(
                self.target_path,
                "SELECT parent_dir FROM user_entities WHERE id=31",
            ),
        )
        self.assertNotIn("is_accessible", self.table_columns(self.target_path, "users"))

    def test_source_without_new_schema_is_rejected(self) -> None:
        legacy_source = Path(self.temp_dir.name) / "already_legacy.db"
        with closing(sqlite3.connect(legacy_source)) as connection:
            connection.executescript(CONVERT.LEGACY_SCHEMA)
            connection.commit()

        code, _, stderr = self.run_tool([str(legacy_source), str(self.target_path)])

        self.assertEqual(1, code)
        self.assertIn("不是新版 tmd 结构", stderr)
        self.assertNotIn("Traceback", stderr)
        self.assertFalse(self.target_path.exists())

    def test_failed_conversion_leaves_no_partial_target(self) -> None:
        # 源库没有 screen_name 唯一约束（历史库可能如此），旧版 users 却有：
        # 写入必然失败，此时不得留下半成品目标文件。
        with closing(sqlite3.connect(self.source_path)) as connection:
            connection.execute("DROP TABLE users")
            connection.executescript(USERS_WITHOUT_UNIQUE)
            connection.executemany(
                "INSERT INTO users(id, screen_name, name, protected, "
                "friends_count, is_accessible) VALUES(?,?,?,?,?,?)",
                [
                    (101, "dup_user", "Alpha", 0, 1, 1),
                    (102, "dup_user", "Beta", 0, 2, 1),
                ],
            )
            connection.commit()

        code, _, stderr = self.run_tool([str(self.source_path), str(self.target_path)])

        self.assertEqual(1, code)
        self.assertIn("转换失败", stderr)
        self.assertNotIn("Traceback", stderr)
        self.assertFalse(self.target_path.exists())
        self.assertEqual([], self.backup_files())

    def test_usage_error_exits_with_code_two(self) -> None:
        with self.assertRaises(SystemExit) as raised:
            self.run_tool([str(self.source_path)])

        self.assertEqual(2, raised.exception.code)


if __name__ == "__main__":
    unittest.main()
