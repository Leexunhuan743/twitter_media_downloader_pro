# foo.db 跨平台迁移说明

本文档说明如何在不同平台之间迁移 `foo.db`，以及仓库内新增的独立迁移工具 `tmd-db-migrate` 的使用方式。

适用场景：

- Windows 主机迁移到 Linux / Docker
- Linux 主机迁移到 Windows
- 本机下载根目录发生变化，例如 `F:\twitter_dl` 改为 `/data`

不适用场景：

- 多个实例同时写同一个 `foo.db`
- 只拷贝 `foo.db`，不拷贝实际下载目录
- 期望把数据库里的绝对路径自动改成相对路径

## 1. 为什么需要这个工具

`foo.db` 位于下载根目录下的 `.data/foo.db`，数据库中的以下字段保存的是实体父目录路径：

- `user_entities.parent_dir`
- `lst_entities.parent_dir`
- `entity_removal_journal.staged_path` / `original_path`（存在未完成目录删除时）

历史数据里这些字段通常是绝对路径，例如：

```text
F:\twitter_dl\users
F:\twitter_dl
```

当下载目录整体迁移到另一台机器或另一种平台后，例如改为：

```text
/data/users
/data
```

原数据库中的绝对路径不会自动变化，结果就是：

- 程序仍然认为实体目录在旧路径下
- 已有下载记录和当前磁盘目录脱节
- 后续查询、同步、目录定位可能异常

这个工具只做一件事：把实体存储路径从旧根目录重写到新根目录。

## 2. 工具位置

命令入口与核心实现：

- [tools/tmd-db-migrate.py](../tools/tmd-db-migrate.py)

## 3. 工具行为

核心实现：`tools/tmd-db-migrate.py#migrate_parent_dirs_in_sqlite_file`。执行顺序是：

1. 预演时以只读方式连接（URI `?mode=ro`）；正式迁移时先执行 `BEGIN IMMEDIATE` 取得 SQLite 写锁
2. 扫描 `user_entities.parent_dir`、`lst_entities.parent_dir` 和可选的删除恢复日志路径（`tools/tmd-db-migrate.py#_collect_migration_plan`）
3. 找出所有以 `from-root` 开头的绝对路径
4. 重写为 `to-root`
5. 在**写锁内、备份之前**检查是否会撞上唯一约束（`tools/tmd-db-migrate.py#_collect_updates`），撞了就立刻失败，什么都不写
6. 若确实有需要改写的行，才用 SQLite Backup API 从只读连接生成一致性快照（`tools/tmd-db-migrate.py#backup_sqlite_database`）
7. 在同一个事务内以"旧值仍匹配"为条件提交更新（`tools/tmd-db-migrate.py#_apply_updates`、`#_apply_removal_journal_updates`）：每条 `UPDATE ... WHERE id=? AND parent_dir=?` 都要求 `rowcount == 1`，否则视为"迁移期间被别处改过"并整体失败回滚

没有任何行需要改写时：不开备份、直接 `COMMIT`，输出 `no changes required`，退出码 0。

备份行为：

- 备份文件：`foo.db.backup.YYYYMMDD_HHMMSS_ffffff`
- 备份是包含已提交 WAL 内容的单一 SQLite 一致性快照，不需要配套复制 `-wal` 或 `-shm`
- 备份路径以独占方式创建（`O_CREAT|O_EXCL`，权限 `0600`，`fsync` 后返回），不会覆盖同名旧备份；同名时自动退避为 `..._ffffff.1`、`.2`……

正式迁移完成后，程序不会另外生成一个新的正式 `foo.db`。它会直接原地更新 `--db` 指向的那个数据库文件，备份文件也放在同一目录下。

`entity_removal_journal` 只在表存在时才处理（老库没有这张表也能迁移），且 `staged_path` 与 `original_path` **必须同时命中** `from-root`，只命中一个时工具报错拒绝（`tools/tmd-db-migrate.py#_collect_removal_journal_updates`）。

## 4. 支持的路径风格

工具不依赖当前运行平台的 `filepath` 语义，而是自己识别路径风格。因此可以在 Linux 上处理 Windows 风格数据库，也可以在 Windows 上把路径改成 Docker/Linux 风格。

当前支持：

- Windows drive path  
  例如：`F:\twitter_dl`

- Windows UNC path  
  例如：`\\server\share\twitter_dl`

- POSIX path  
  例如：`/data`

匹配规则（`tools/tmd-db-migrate.py#_trim_portable_prefix`）：

- **路径风格必须一致**：只有"库里的值"与 `--from-root` 同为 Windows 或同为 POSIX 时才可能命中；`--to-root` 想写成都行（这是跨平台迁移的关键）
- Windows 路径前缀匹配大小写不敏感（盘符与各级目录都忽略大小写），且盘符/UNC 共享名（volume）必须相同
- POSIX 路径前缀匹配大小写敏感
- 相对路径不会被改写（`tools/tmd-db-migrate.py#remap_parent_dir` 直接跳过非绝对路径）
- `--from-root` 与 `--to-root` 必须是绝对路径，否则工具直接报错退出

## 5. 基本用法

先预演：

```bash
python ./tools/tmd-db-migrate.py --db "F:\twitter_dl\.data\foo.db" --from-root "F:\twitter_dl" --to-root "/data" --dry-run
```

正式迁移：

```bash
python ./tools/tmd-db-migrate.py --db "F:\twitter_dl\.data\foo.db" --from-root "F:\twitter_dl" --to-root "/data"
```

命令参数（`tools/tmd-db-migrate.py#_build_parser`，单双横线写法都接受，如 `-db` 等同 `--db`）：

- `--db`
  - 必填
  - 目标数据库文件路径（文件必须已存在）

- `--from-root`
  - 必填
  - 旧下载根目录，**必须是绝对路径**；库中路径必须与它同为 Windows 或同为 POSIX 风格才可能命中

- `--to-root`
  - 必填
  - 新下载根目录，**必须是绝对路径**；风格任意（Windows ↔ POSIX 可互转）

- `--dry-run`
  - 可选
  - 只输出迁移摘要，不写库、不加写锁、不创建备份

退出码：`0` 表示成功（含"无需改动"），`1` 表示失败，原因以 `migration failed: ...` 打到 stderr。

## 6. 输出说明

工具会输出类似信息：

```text
dry_run=false
user_entities: 12/25 updated
lst_entities: 2/4 updated
entity_removal_journal: 0/0 updated
backup=F:\twitter_dl\.data\foo.db.backup.20260509_224500_123456
samples:
- user_entities id=1: "F:\\twitter_dl\\users" -> "/data/users"
- lst_entities id=3: "F:\\twitter_dl" -> "/data"
```

含义：

- `updated/total` 表示该表总记录数中有多少条被改写
- `backup` 表示正式迁移前生成的备份文件；**只在确实有改动时才出现**（无改动时该行不打印，另打印 `no changes required`）
- `samples` 只展示部分样例，最多 10 条（常量 `MAX_SAMPLES`），便于快速确认方向是否正确
- `--dry-run` 使用只读 SQLite 连接，不切换 journal mode、不 checkpoint，也不创建备份

## 7. 迁移前建议

建议按这个顺序做：

1. 停止所有正在使用该下载目录的 TMD 进程
2. 完整备份整个下载根目录，而不只是 `foo.db`
3. 先执行 `--dry-run`
4. 确认输出的样例路径是你期望的目标路径
5. 再执行正式迁移

不要在程序运行中直接改库。当前项目 SQLite 使用 WAL 且连接串行化（主程序 `MaxOpenConns=1`），但运行中改库仍然会引入不必要风险。

工具自身也设了 `PRAGMA busy_timeout=30000`：如果别的进程正持有写锁，它会等最多 30 秒再报错退出，不会悄悄写坏数据。正式迁移请确保 `--db` 指向的就是主程序在用的 `{下载根目录}/.data/foo.db`，并且没有第二个实例在写它。

## 8. 迁移后建议校验

建议至少检查以下几点：

1. 数据库是否还能打开
2. 用户实体和列表实体能否正确定位目录
3. 主程序启动后是否能正常连接数据库
4. 随机抽查几个用户目录和列表目录

推荐校验方式：

```bash
python -m unittest -v tools/test_tmd_db_migrate.py
go test ./...
```

或直接启动主程序，用现有下载根目录做一次只读/轻量操作验证。

`tools/test_tmd_db_migrate.py` 覆盖的关键行为（可作为改动工具时的回归基线）：Windows 盘符前缀大小写不敏感、UNC/POSIX 语义、相对路径不改写、`--dry-run` 只读且不产生备份、有改动时用一致性备份并同步迁移删除恢复日志路径、老库没有 `entity_removal_journal` 表仍可迁移、冲突在备份与写入之前失败、`staged_path`/`original_path` 只命中一个时拒绝迁移。

## 9. 冲突保护

数据库 schema 对以下组合有唯一约束：

- `user_entities(user_id, parent_dir)`
- `lst_entities(lst_id, parent_dir)`

因此如果迁移后会出现两条记录落到同一个 `(owner, parent_dir)` 上，工具会直接失败并拒绝写入。

例如：

```text
旧记录1: user_id=1, parent_dir=F:\twitter_dl\users
旧记录2: user_id=1, parent_dir=/data/users
```

当你把 `F:\twitter_dl` 改写成 `/data` 时，这两条会冲突。此时工具会报错，数据库保持原样。

这一步是故意做严格的，不自动合并记录。

检查细节（`tools/tmd-db-migrate.py#_collect_updates`）：

- 在取得写锁之后、创建备份之前完成，所以冲突时**不会**留下备份文件，也不会写入任何一行
- 判定键是 `owner_id + "|" + 目标路径.lower()`（`user_entities` 用 `user_id`，`lst_entities` 用 `lst_id`），与 schema 里 `parent_dir COLLATE NOCASE` 的大小写不敏感语义一致
- 参与判重的**不只是**被改写的行：目标路径等于原值的行同样进键表，因此库里若已存在大小写不同的同 owner 路径，也会一并报错
- `entity_removal_journal` 另有一套判重：目标 `staged_path` 经 `casefold()` 后重复即报错；此外一行的 `staged_path` 与 `original_path` 只命中一个 `from-root` 时也直接报错（拒绝"半迁移"的日志行）
- 失败时错误信息会带上 owner、两个行 id 和目标路径，便于定位

## 10. 当前边界

当前工具只处理实体父目录和删除恢复日志中绝对路径的根目录改写，不处理：

- schema 升级（由主程序启动时的 `internal/database/schema.go#MigrateDatabase` 与 `internal/database/sqlite_migration.go#migrateExistingDatabase` 负责，见 [foo.db 技术文档](foo.db%20技术文档.md) 1.3 / 1.4）
- `is_accessible` 等历史 migration
- 把绝对路径批量转换为相对路径
- 清理重复实体
- 修改用户目录名或列表目录名

也就是说，它解决的是：

> “数据库里路径前缀还是旧平台/旧磁盘的值”

而不是一切数据库兼容问题。

补充说明：

- 在当前真实数据模型里，`user_entities.parent_dir` 通常是 `{下载根目录}/users`（例：`F:\twitter_dl\users`）——`internal/path/store.go#StorePath.Users` 就是 `filepath.Join(root, "users")`
- `lst_entities.parent_dir` 通常直接是下载根目录本身，例如 `F:\twitter_dl`（启动清扫 `internal/entity/storage.go#CleanupStagedDirectories(db, root, users)` 正是按这两级扫描暂存目录，与之一致）

因此迁移时推荐始终传：

```text
--from-root "旧下载根目录"
--to-root "新下载根目录"
```

不要把 `--from-root` 误写成 `F:\twitter_dl\users`。那样只会命中 `user_entities`，`lst_entities` 不会被改写。

## 11. 设计取舍

当前没有直接把 `parent_dir` 改成相对路径，原因是：

- 现有数据库读写逻辑仍然按绝对路径工作
- 一次性改成相对路径会扩大兼容面
- 当前最直接的问题是跨平台根路径变化，不是 schema 重设计

所以当前方案是一个保守工具：

- 不改业务模型
- 不改主程序现有路径语义
- 只做可预期的前缀重写

如果后续要把 `foo.db` 彻底改成“与宿主路径无关”的相对路径模型，那会是下一阶段的 schema/兼容改造，不在这个工具范围内。

***

> **适用版本**: TMD v3.7.2
