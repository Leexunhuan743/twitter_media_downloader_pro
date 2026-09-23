package entity

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/unkmonster/tmd/internal/database"
)

func openStorageTestDB(t *testing.T) *sqlx.DB {
	t.Helper()
	db, err := sqlx.Connect(database.DriverName, database.MemoryDSN(true))
	require.NoError(t, err)
	database.CreateTables(db)
	t.Cleanup(func() { require.NoError(t, db.Close()) })
	return db
}

func TestStoredEntityPathHandlesLegacyWindowsSuffix(t *testing.T) {
	parentDir := t.TempDir()
	for _, name := range []string{"legacy.", "legacy "} {
		t.Run(name, func(t *testing.T) {
			path, err := storedEntityPath(parentDir, name)

			require.NoError(t, err)
			expectedName := name
			if runtime.GOOS == "windows" {
				expectedName = strings.TrimRight(name, " .")
			}
			assert.Equal(t, filepath.Join(parentDir, expectedName), path)
			assert.ErrorIs(t, ValidateName(name), ErrInvalidName)
		})
	}
}

func TestStoredEntityPathRejectsUnsafeNames(t *testing.T) {
	for _, name := range []string{"", ".", "..", "../escape", `child/name`, `child\name`, "nul\x00name"} {
		t.Run(name, func(t *testing.T) {
			_, err := storedEntityPath(t.TempDir(), name)
			assert.ErrorIs(t, err, ErrInvalidName)
		})
	}
	if runtime.GOOS == "windows" {
		for _, name := range []string{" ", "..."} {
			_, err := storedEntityPath(t.TempDir(), name)
			assert.ErrorIs(t, err, ErrInvalidName)
		}
	}
}

func TestValidateNameRejectsWindowsIncompatibleNames(t *testing.T) {
	for _, name := range []string{
		"bad:name", "bad*name", "bad?name", `bad"name`, "bad<name", "bad>name", "bad|name",
		"CON", "con.txt", "CON .txt", "PRN", "AUX.log", "NUL", "COM1", "com9.txt", "COM1 .log",
		"LPT1", "lpt9.log", "com\u00b9.txt", "LPT\u00b3.log",
		"CLOCK$", "CONIN$", "CONOUT$",
		"control\x1fname",
	} {
		t.Run(name, func(t *testing.T) {
			assert.ErrorIs(t, ValidateName(name), ErrInvalidName)
		})
	}

	for _, name := range []string{"COM0", "COM10", "COMLPT1", "LPT0", "LPT10", "CONSOLE", "report.txt"} {
		t.Run("allowed/"+name, func(t *testing.T) {
			assert.NoError(t, ValidateName(name))
		})
	}
}

func TestValidateNameRejectsStagedPrefixCaseVariants(t *testing.T) {
	// Windows 文件系统大小写不敏感：保留前缀的大小写变体必须同样被拒绝，
	// 否则可绕过内部前缀保护且对启动清扫不可见。
	for _, name := range []string{
		".tmd-remove-v1-abcdef1234567890-x",
		".TMD-REMOVE-V1-ABCDEF1234567890-X",
		".Tmd-Remove-V1-aBcDeF1234567890-x",
		".tmd-remove-anything",
		".TMD-REMOVE-anything",
	} {
		t.Run(name, func(t *testing.T) {
			assert.ErrorIs(t, ValidateName(name), ErrInvalidName)
		})
	}

	for _, name := range []string{"tmd-remove-x", ".tmd-remove", ".tmd_remove-x", "x.tmd-remove-1"} {
		t.Run("allowed/"+name, func(t *testing.T) {
			assert.NoError(t, ValidateName(name))
		})
	}
}

func TestCleanupStagedDirectoriesRetainsUnjournaledLegacyStage(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	staged := filepath.Join(parentDir, stagedDirectoryPrefix+"orphan")
	require.NoError(t, os.MkdirAll(filepath.Join(staged, "nested"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(staged, "nested", "media.jpg"), []byte("data"), 0600))
	normalDir := filepath.Join(parentDir, "normal")
	require.NoError(t, os.Mkdir(normalDir, 0755))
	prefixedFile := filepath.Join(parentDir, stagedDirectoryPrefix+"file")
	require.NoError(t, os.WriteFile(prefixedFile, []byte("keep"), 0600))

	cleanup, err := CleanupStagedDirectories(db, parentDir, parentDir, filepath.Join(parentDir, "missing"))

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, staged)
	assert.FileExists(t, filepath.Join(staged, "nested", "media.jpg"))
	assert.DirExists(t, normalDir)
	assert.FileExists(t, prefixedFile)
}

func TestCleanupStagedDirectoriesDoesNotFollowSymlinks(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	targetDir := t.TempDir()
	linkPath := filepath.Join(parentDir, stagedDirectoryPrefix+"link")
	if err := os.Symlink(targetDir, linkPath); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	cleanup, err := CleanupStagedDirectories(db, parentDir)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, targetDir)
	_, err = os.Lstat(linkPath)
	assert.NoError(t, err)
}

func TestCleanupStagedDirectoriesRetainsCandidatesForMissingActiveEntity(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "active", Name: "Active", IsAccessible: true}))
	require.NoError(t, database.CreateUserEntity(db, &database.UserEntity{UserId: 1, Name: "missing-active", ParentDir: parentDir}))
	staged := filepath.Join(parentDir, stagedDirectoryPrefix+"possible-active")
	require.NoError(t, os.Mkdir(staged, 0755))

	cleanup, err := CleanupStagedDirectories(db, parentDir)

	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.Error(t, err)
	assert.DirExists(t, staged)
}

func TestCleanupStagedDirectoriesPreservesReferencedLegacyPrefix(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	require.NoError(t, database.CreateUser(db, &database.User{Id: 1, ScreenName: "legacy", Name: "Legacy", IsAccessible: true}))
	legacyName := stagedDirectoryPrefix + "legacy-record"
	require.NoError(t, database.CreateUserEntity(db, &database.UserEntity{UserId: 1, Name: legacyName, ParentDir: parentDir}))
	legacyPath := filepath.Join(parentDir, legacyName)
	require.NoError(t, os.Mkdir(legacyPath, 0755))

	cleanup, err := CleanupStagedDirectories(db, parentDir)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, legacyPath)
}

func TestCleanupStagedDirectoriesRestoresInterruptedRemoval(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "recover-me")
	originalPath := filepath.Join(parentDir, "recover-me")
	require.NoError(t, os.Mkdir(originalPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(originalPath, "media.jpg"), []byte("keep"), 0600))

	staged, err := stageEntityDirectoryRemoval(db, originalPath)
	require.NoError(t, err)
	assert.NoDirExists(t, originalPath)
	assert.DirExists(t, staged.stagedPath)

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Equal(t, 1, cleanup.Restored)
	assert.FileExists(t, filepath.Join(originalPath, "media.jpg"))
	assert.NoDirExists(t, staged.stagedPath)
}

func TestCleanupStagedDirectoriesRetainsJournaledStageWhenRecoveryTargetExists(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "conflicted")
	originalPath := filepath.Join(parentDir, "conflicted")
	require.NoError(t, os.Mkdir(originalPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(originalPath, "staged-media.jpg"), []byte("staged"), 0600))

	staged, err := stageEntityDirectoryRemoval(db, originalPath)
	require.NoError(t, err)
	require.NoError(t, os.Mkdir(originalPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(originalPath, "current-media.jpg"), []byte("current"), 0600))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.FileExists(t, filepath.Join(originalPath, "current-media.jpg"))
	assert.FileExists(t, filepath.Join(staged.stagedPath, "staged-media.jpg"))
	journals, listErr := database.ListEntityRemovalJournals(db)
	require.NoError(t, listErr)
	assert.Len(t, journals, 1)
}

func TestCleanupStagedDirectoriesRemovesCommittedRemoval(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	record := seedStorageUserEntity(t, db, parentDir, "remove-me")
	originalPath := filepath.Join(parentDir, "remove-me")
	require.NoError(t, os.Mkdir(originalPath, 0755))

	staged, err := stageEntityDirectoryRemoval(db, originalPath)
	require.NoError(t, err)
	require.NoError(t, database.DelUserEntity(db, uint32(record.Id.Int32)))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Equal(t, 1, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.NoDirExists(t, staged.stagedPath)
}

// journal 是唯一的归属证明：无 journal 的暂存目录（含名字带 `v1-<hash>` 的旧格式）
// 一律保留待人工处理，绝不当成"已提交删除"而递归删除媒体。
func TestCleanupStagedDirectoriesRetainsUnjournaledVersionedStage(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "recover-window")
	originalPath := filepath.Join(parentDir, "recover-window")
	stagedPath := filepath.Join(parentDir, ".tmd-remove-v1-0123456789abcdef-fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "media.jpg"), []byte("keep"), 0600))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, stagedPath)
	assert.FileExists(t, filepath.Join(stagedPath, "media.jpg"))
	assert.NoFileExists(t, filepath.Join(originalPath, "media.jpg"))
}

func TestCleanupStagedDirectoriesRetainsUnjournaledStageWhenRecoveryTargetExists(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "conflicted-window")
	originalPath := filepath.Join(parentDir, "conflicted-window")
	stagedPath := filepath.Join(parentDir, stagedDirectoryPrefix+"fixture2")
	require.NoError(t, os.Mkdir(originalPath, 0755))
	require.NoError(t, os.Mkdir(stagedPath, 0755))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, originalPath)
	assert.DirExists(t, stagedPath)
}

func TestCleanupStagedDirectoriesRetainsZeroCandidateStageWhenActiveDirIsMissing(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	// active 记录目录缺失（例如 Windows 归一化尾点/空格后生成的库迁移到
	// 本平台，记录名与磁盘目录名不一致），且该暂存目录没有 journal——
	// 归属不明，绝不能当作已提交删除 RemoveAll 掉媒体。
	seedStorageUserEntity(t, db, parentDir, "missing-active")
	// 注意：不创建 missing-active 目录，模拟目录缺失。
	stagedPath := filepath.Join(parentDir, stagedDirectoryPrefix+"fixture3")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "media.jpg"), []byte("keep"), 0600))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, stagedPath)
	assert.FileExists(t, filepath.Join(stagedPath, "media.jpg"))
}

func TestCleanupStagedDirectoriesRetainsZeroCandidateStageWhenAllActiveDirsExist(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	// 无 journal 的暂存目录、且 parent 下所有 active 目录都存在：仍不能证明它
	// 已提交删除，必须保留以避免对撞名前缀误删。
	seedStorageUserEntity(t, db, parentDir, "active-user")
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, "active-user"), 0755))
	stagedPath := filepath.Join(parentDir, stagedDirectoryPrefix+"fixture4")
	require.NoError(t, os.Mkdir(stagedPath, 0755))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, stagedPath)
}

func TestCleanupStagedDirectoriesRemovesStaleJournal(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	stagedPath := filepath.Join(parentDir, stagedDirectoryPrefix+"fixture6")
	require.NoError(t, database.CreateEntityRemovalJournal(db, database.EntityRemovalJournal{
		StagedPath:   stagedPath,
		OriginalPath: filepath.Join(parentDir, "gone"),
	}))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	journals, err := database.ListEntityRemovalJournals(db)
	require.NoError(t, err)
	assert.Empty(t, journals)
}

func TestCleanupStagedDirectoriesRestoresJournaledStageWithTrimmedOriginalPath(t *testing.T) {
	// 反向变体：journal 的 OriginalPath 是裁剪名（"foo"，Windows 源删除
	// 流程经 storedEntityPath 归一化），而 active 记录是原样尾点名
	// （"foo."，Linux 扫描）。修复后按裁剪后 base 相等匹配并恢复到记录
	// 可寻址的路径，而不是 RemoveAll 掉媒体。
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "foo.")
	trimmedPath := filepath.Join(parentDir, "foo")
	stagedPath := filepath.Join(parentDir, stagedDirectoryPrefix+"fixture7")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "media.jpg"), []byte("keep"), 0600))
	require.NoError(t, database.CreateEntityRemovalJournal(db, database.EntityRemovalJournal{
		StagedPath:   stagedPath,
		OriginalPath: trimmedPath,
	}))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Equal(t, 1, cleanup.Restored)
	// 恢复目标必须能被记录寻址：Windows 上是归一化后的裁剪名 "foo"，
	// Linux 上是字面 "foo."（用 storedEntityPath 计算平台一致的期望）。
	expectedPath, err := storedEntityPath(parentDir, "foo.")
	require.NoError(t, err)
	assert.FileExists(t, filepath.Join(expectedPath, "media.jpg"))
	assert.NoDirExists(t, stagedPath)
	journals, err := database.ListEntityRemovalJournals(db)
	require.NoError(t, err)
	assert.Empty(t, journals)
}

func TestCleanupStagedDirectoriesRestoresJournaledStageWithTrailingSuffix(t *testing.T) {
	// journal 的 OriginalPath 带尾点（"foo."），active 记录同名——在 Windows
	// 上记录被归一化为 "foo"（activePaths 键为裁剪名），直接匹配会落空；
	// 修复后按裁剪变体匹配并恢复到与记录一致的目录名。
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "foo.")
	originalPath := filepath.Join(parentDir, "foo.")
	stagedPath := filepath.Join(parentDir, stagedDirectoryPrefix+"fixture8")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "media.jpg"), []byte("keep"), 0600))
	require.NoError(t, database.CreateEntityRemovalJournal(db, database.EntityRemovalJournal{
		StagedPath:   stagedPath,
		OriginalPath: originalPath,
	}))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Equal(t, 1, cleanup.Restored)
	// 恢复目标必须能被记录寻址：Windows 上是归一化后的裁剪名 "foo"，
	// Linux 上是字面 "foo."（用 storedEntityPath 计算平台一致的期望）。
	expectedPath, err := storedEntityPath(parentDir, "foo.")
	require.NoError(t, err)
	assert.FileExists(t, filepath.Join(expectedPath, "media.jpg"))
	assert.NoDirExists(t, stagedPath)
	journals, err := database.ListEntityRemovalJournals(db)
	require.NoError(t, err)
	assert.Empty(t, journals)
}

func seedStorageUserEntity(t *testing.T, db *sqlx.DB, parentDir, name string) *database.UserEntity {
	t.Helper()
	var count int
	require.NoError(t, db.Get(&count, `SELECT COUNT(*) FROM users`))
	userID := uint64(count + 1)
	require.NoError(t, database.CreateUser(db, &database.User{Id: userID, ScreenName: fmt.Sprintf("user-%d", userID), Name: "User", IsAccessible: true}))
	record := &database.UserEntity{UserId: userID, Name: name, ParentDir: parentDir}
	require.NoError(t, database.CreateUserEntity(db, record))
	return record
}

// 回归（#7 精简后）：删除流程的写序改成「写 journal → 改名」，因此崩在
// INSERT 与 Rename 之间只会留下"journal 行在、暂存路径不在"的陈旧行。
// 启动对账必须清掉这类行，且原目录与媒体完好无损。
func TestCleanupStagedDirectoriesDropsJournalWithoutStagedDir(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "crash-window")
	originalPath := filepath.Join(parentDir, "crash-window")
	require.NoError(t, os.Mkdir(originalPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(originalPath, "media.jpg"), []byte("keep"), 0600))

	// 模拟"journal 已写、rename 未执行"的崩溃窗口。
	ghostStaged := filepath.Join(parentDir, stagedDirectoryPrefix+"ghost")
	require.NoError(t, database.CreateEntityRemovalJournal(db, database.EntityRemovalJournal{
		StagedPath:   ghostStaged,
		OriginalPath: originalPath,
	}))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.FileExists(t, filepath.Join(originalPath, "media.jpg"), "original media must be untouched")
	journals, listErr := database.ListEntityRemovalJournals(db)
	require.NoError(t, listErr)
	assert.Empty(t, journals, "stale journal row without a staged directory must be dropped")
}

// 回归（#7）：journal 存在且记录已被提交删除时，暂存目录仍必须被 RemoveAll，
// 即新写序不削弱"已提交删除的回收"这条能力。
func TestCleanupStagedDirectoriesRemovesCommittedRemovalWithJournal(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	record := seedStorageUserEntity(t, db, parentDir, "remove-me-journaled")
	originalPath := filepath.Join(parentDir, "remove-me-journaled")
	require.NoError(t, os.Mkdir(originalPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(originalPath, "media.jpg"), []byte("gone"), 0600))

	staged, err := stageEntityDirectoryRemoval(db, originalPath)
	require.NoError(t, err)
	require.NotEmpty(t, staged.stagedPath)

	// 新写序：暂存目录一存在就必须已有 journal 行。
	journals, listErr := database.ListEntityRemovalJournals(db)
	require.NoError(t, listErr)
	require.Len(t, journals, 1)

	require.NoError(t, database.DelUserEntity(db, uint32(record.Id.Int32)))
	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Equal(t, 1, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.NoDirExists(t, staged.stagedPath)
	journals, listErr = database.ListEntityRemovalJournals(db)
	require.NoError(t, listErr)
	assert.Empty(t, journals)
}
