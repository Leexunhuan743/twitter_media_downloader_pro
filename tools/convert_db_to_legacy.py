#!/usr/bin/env python3
"""
convert_db_to_legacy.py

将新版本 (tmd) 的 SQLite 数据库转换为旧版本 (tmd-2.4.4) 兼容格式。

状态说明:
  本脚本是历史版本的一次性工具，仓库内没有任何调用路径（Go 代码、CI、其它脚本
  都不会执行它），只为仍在跑 tmd-2.4.4 旧库、又需要把新版库降级回去的用户手工
  保留。若你只是要修正 parent_dir 里记录的下载根目录，请优先使用
  tools/tmd-db-migrate.py；本脚本只负责「新格式库 → 旧格式库」的整体转换，
  且默认不会覆盖已存在的目标文件。

Schema 差异对照:
  - users:           新版多出 is_accessible 列 → 旧版无此列，丢弃
  - user_previous_names: 新版列名 user_id      → 旧版列名 uid
  - lsts:             新版列名 owner_user_id   → 旧版列名 owner_uid
  - lst_entities / user_entities / user_links: 结构一致，直接复制

用法:
  python convert_db_to_legacy.py <新版db路径> <输出旧版db路径> [--dry-run] [--force]

示例:
  # 预览将要发生的变更（源库只读，不创建、不覆盖任何文件）
  python convert_db_to_legacy.py new_tmd.db legacy_tmd.db --dry-run
  # 正式转换（目标文件已存在时默认拒绝）
  python convert_db_to_legacy.py new_tmd.db legacy_tmd.db
  # 允许覆盖已存在的目标文件（覆盖前先备份原文件）
  python convert_db_to_legacy.py new_tmd.db legacy_tmd.db --force

退出码:
  0  成功（含 --dry-run）
  1  运行失败（源库缺失/不可读/非 SQLite、目标已存在且未加 --force 等）
  2  参数用法错误
"""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

SQLITE_BUSY_TIMEOUT_MS = 30_000


class ConversionError(Exception):
    """Raised when the database cannot be converted safely."""


@dataclass(frozen=True)
class TableConversion:
    """一张表的转换定义（SELECT 已完成新旧列名映射）。"""

    table: str
    select_sql: str
    insert_sql: str


@dataclass(frozen=True)
class TablePlan:
    """预览/结果中的单表行数。"""

    table: str
    rows: int


@dataclass
class ConversionResult:
    source_path: str = ""
    target_path: str = ""
    target_exists: bool = False
    dry_run: bool = False
    backup_path: str = ""
    tables: list[TablePlan] = field(default_factory=list)


# ── 转换定义（SQL 与历史实现逐字一致，转换语义不变）────────────────
CONVERSIONS: tuple[TableConversion, ...] = (
    TableConversion(
        table="users",
        # 丢弃 is_accessible 列
        select_sql="SELECT id, screen_name, name, protected, friends_count FROM users",
        insert_sql=(
            "INSERT INTO users(id, screen_name, name, protected, friends_count) "
            "VALUES(?,?,?,?,?)"
        ),
    ),
    TableConversion(
        table="user_previous_names",
        # user_id → uid
        select_sql=(
            "SELECT id, user_id, screen_name, name, record_date "
            "FROM user_previous_names"
        ),
        insert_sql=(
            "INSERT INTO user_previous_names(id, uid, screen_name, name, record_date) "
            "VALUES(?,?,?,?,?)"
        ),
    ),
    TableConversion(
        table="lsts",
        # owner_user_id → owner_uid
        select_sql="SELECT id, name, owner_user_id FROM lsts",
        insert_sql="INSERT INTO lsts(id, name, owner_uid) VALUES(?,?,?)",
    ),
    TableConversion(
        table="lst_entities",
        # 结构一致，直接复制
        select_sql="SELECT id, lst_id, name, parent_dir FROM lst_entities",
        insert_sql="INSERT INTO lst_entities(id, lst_id, name, parent_dir) VALUES(?,?,?,?)",
    ),
    TableConversion(
        table="user_entities",
        # 结构一致，直接复制
        select_sql=(
            "SELECT id, user_id, name, latest_release_time, parent_dir, media_count "
            "FROM user_entities"
        ),
        insert_sql=(
            "INSERT INTO user_entities"
            "(id, user_id, name, latest_release_time, parent_dir, media_count) "
            "VALUES(?,?,?,?,?,?)"
        ),
    ),
    TableConversion(
        table="user_links",
        # 结构一致，直接复制
        select_sql="SELECT id, user_id, name, parent_lst_entity_id FROM user_links",
        insert_sql=(
            "INSERT INTO user_links(id, user_id, name, parent_lst_entity_id) "
            "VALUES(?,?,?,?)"
        ),
    ),
)

LEGACY_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER NOT NULL,
    screen_name VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    protected BOOLEAN NOT NULL,
    friends_count INTEGER NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (screen_name)
);

CREATE TABLE IF NOT EXISTS user_previous_names (
    id INTEGER NOT NULL,
    uid INTEGER NOT NULL,
    screen_name VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    record_date DATE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(uid) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lsts (
    id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    owner_uid INTEGER NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS lst_entities (
    id INTEGER NOT NULL,
    lst_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    parent_dir VARCHAR NOT NULL COLLATE NOCASE,
    PRIMARY KEY (id),
    UNIQUE (lst_id, parent_dir)
);

CREATE TABLE IF NOT EXISTS user_entities (
    id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    latest_release_time DATETIME,
    parent_dir VARCHAR COLLATE NOCASE NOT NULL,
    media_count INTEGER,
    PRIMARY KEY (id),
    UNIQUE (user_id, parent_dir),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_links (
    id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    parent_lst_entity_id INTEGER NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (user_id, parent_lst_entity_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(parent_lst_entity_id) REFERENCES lst_entities(id)
);

CREATE INDEX IF NOT EXISTS idx_user_links_user_id ON user_links(user_id);
"""


def _readonly_database_uri(db_path: str) -> str:
    return Path(db_path).resolve().as_uri() + "?mode=ro"


def _open_source(new_db_path: str) -> sqlite3.Connection:
    """以只读方式打开源库，并校验它确实是一个可读的 SQLite 数据库。"""
    if not new_db_path.strip():
        raise ConversionError("新版数据库路径不能为空")
    if not Path(new_db_path).is_file():
        raise ConversionError(f"新版数据库文件不存在: {new_db_path}")

    connection: sqlite3.Connection | None = None
    try:
        connection = sqlite3.connect(
            _readonly_database_uri(new_db_path),
            uri=True,
            timeout=SQLITE_BUSY_TIMEOUT_MS / 1000,
        )
        connection.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        # 非 SQLite 文件在 connect 阶段不会报错，必须实际查询一次才能暴露。
        connection.execute("SELECT count(*) FROM sqlite_master")
    except sqlite3.Error as error:
        if connection is not None:
            connection.close()
        raise ConversionError(
            f"无法以只读方式打开新版数据库 {new_db_path}"
            f"（文件不可读或不是 SQLite 数据库）: {error}"
        ) from error
    return connection


def _collect_plan(source: sqlite3.Connection) -> list[TablePlan]:
    """读取各表行数（同时校验表/列名符合新版结构），不写入任何东西。"""
    plan: list[TablePlan] = []
    for conversion in CONVERSIONS:
        try:
            row = source.execute(
                f"SELECT COUNT(*) FROM ({conversion.select_sql})"
            ).fetchone()
        except sqlite3.Error as error:
            raise ConversionError(
                f"读取源表 {conversion.table} 失败"
                f"（源库不是新版 tmd 结构？）: {error}"
            ) from error
        plan.append(TablePlan(table=conversion.table, rows=int(row[0]) if row else 0))
    return plan


def _reserve_backup_path(target_path: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    base = target_path + ".backup." + timestamp
    for attempt in range(100):
        candidate = base if attempt == 0 else f"{base}.{attempt}"
        try:
            descriptor = os.open(candidate, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            continue
        except OSError as error:
            raise ConversionError(
                f'无法预留备份路径 "{candidate}": {error}'
            ) from error
        os.close(descriptor)
        return candidate
    raise ConversionError("无法预留唯一的备份路径")


def backup_existing_target(target_path: str) -> str:
    """逐字节复制已存在的目标文件（不解析其内容，坏文件也能先存下来）。"""
    backup_path = _reserve_backup_path(target_path)
    try:
        with open(target_path, "rb") as source_file:
            with open(backup_path, "wb") as backup_file:
                shutil.copyfileobj(source_file, backup_file)
                backup_file.flush()
                os.fsync(backup_file.fileno())
        return backup_path
    except OSError as error:
        try:
            os.unlink(backup_path)
        except OSError:
            pass
        raise ConversionError(
            f'备份原目标文件失败 "{target_path}" → "{backup_path}": {error}'
        ) from error


def _write_legacy_database(
    source: sqlite3.Connection, destination: sqlite3.Connection
) -> None:
    cursor = destination.cursor()
    cursor.executescript(LEGACY_SCHEMA)

    total = len(CONVERSIONS)
    for index, conversion in enumerate(CONVERSIONS, start=1):
        print(f"[{index}/{total}] 迁移 {conversion.table} ...")
        rows = source.execute(conversion.select_sql).fetchall()
        cursor.executemany(conversion.insert_sql, rows)
        print(f"       → {len(rows)} 条记录")

    destination.commit()


def convert(
    new_db_path: str,
    legacy_db_path: str,
    dry_run: bool = False,
    force: bool = False,
) -> ConversionResult:
    """转换新格式库 → tmd-2.4.4 旧格式库。

    dry_run=True 时只读打开源库并返回预览计划，绝不创建/覆盖任何文件。
    正式执行时若目标文件已存在则默认拒绝，除非 force=True（覆盖前先备份）。
    """
    if not legacy_db_path.strip():
        raise ConversionError("输出旧版数据库路径不能为空")

    if Path(new_db_path).exists() and Path(legacy_db_path).exists():
        try:
            same_file = os.path.samefile(new_db_path, legacy_db_path)
        except OSError:
            same_file = False
        if same_file:
            raise ConversionError(
                f"源库与目标库是同一个文件: {new_db_path}；转换会破坏源库，已拒绝"
            )

    source = _open_source(new_db_path)
    try:
        result = ConversionResult(
            source_path=new_db_path,
            target_path=legacy_db_path,
            target_exists=Path(legacy_db_path).exists(),
            dry_run=dry_run,
        )
        result.tables = _collect_plan(source)

        if dry_run:
            return result

        if result.target_exists:
            if not force:
                raise ConversionError(
                    f"目标文件已存在: {legacy_db_path}；本工具默认不覆盖。"
                    "如需覆盖请加 --force（覆盖前会先备份原文件），"
                    "或先用 --dry-run 预览。"
                )
            result.backup_path = backup_existing_target(legacy_db_path)
            try:
                os.remove(legacy_db_path)
            except OSError as error:
                raise ConversionError(
                    f'无法删除待覆盖的目标文件 "{legacy_db_path}": {error}'
                ) from error

        destination: sqlite3.Connection | None = None
        try:
            destination = sqlite3.connect(
                legacy_db_path,
                timeout=SQLITE_BUSY_TIMEOUT_MS / 1000,
            )
            _write_legacy_database(source, destination)
        except (sqlite3.Error, OSError) as error:
            if destination is not None:
                destination.close()
                destination = None
            try:
                os.remove(legacy_db_path)
            except OSError:
                pass
            raise ConversionError(
                f'转换失败，未保留半成品目标文件 "{legacy_db_path}": {error}'
            ) from error
        finally:
            if destination is not None:
                destination.close()

        return result
    finally:
        source.close()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="convert_db_to_legacy",
        usage="%(prog)s <新版db路径> <输出旧版db路径> [--dry-run] [--force]",
        description="将新版 tmd 数据库转换为 tmd-2.4.4 旧版格式。",
    )
    parser.add_argument("new_db", help="新版 tmd 数据库路径（只读打开）")
    parser.add_argument("legacy_db", help="输出旧版数据库路径")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只预览将要发生的变更（表/行数/目标路径），不创建、不覆盖任何文件",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="目标文件已存在时允许覆盖（覆盖前先备份原文件）",
    )
    return parser


def run(args: list[str]) -> int:
    options = _build_parser().parse_args(args)
    try:
        result = convert(
            options.new_db,
            options.legacy_db,
            dry_run=options.dry_run,
            force=options.force,
        )
    except ConversionError as error:
        print(f"[ERROR] {error}", file=sys.stderr)
        return 1

    if result.dry_run:
        print(f"[dry-run] 源库(只读): {result.source_path}")
        if not result.target_exists:
            target_state = "不存在（正式执行将新建）"
        elif options.force:
            target_state = "已存在（已加 --force，正式执行会先备份再覆盖）"
        else:
            target_state = "已存在（正式执行需加 --force 才会覆盖，覆盖前会先备份）"
        print(f"[dry-run] 目标库: {result.target_path} — {target_state}")
        print("[dry-run] 将要写入的表与行数:")
        for table in result.tables:
            print(f"  - {table.table}: {table.rows} 行")
        print("[dry-run] 未创建、未覆盖任何文件")
        return 0

    if result.backup_path:
        print(f"[INFO] 原目标文件已备份: {result.backup_path}")
    print(f"\n[DONE] 转换完成，旧版数据库已写入: {result.target_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:]))
