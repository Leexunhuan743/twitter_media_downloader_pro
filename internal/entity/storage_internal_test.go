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

func TestCleanupStagedDirectories(t *testing.T) {
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

	require.NoError(t, err)
	assert.Equal(t, 1, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.NoDirExists(t, staged)
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

func TestCleanupStagedDirectoriesRestoresUnjournaledVersionedStage(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "recover-window")
	originalPath := filepath.Join(parentDir, "recover-window")
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(originalPath), "*")+"fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "media.jpg"), []byte("keep"), 0600))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Equal(t, 1, cleanup.Restored)
	assert.FileExists(t, filepath.Join(originalPath, "media.jpg"))
	assert.NoDirExists(t, stagedPath)
}

func TestCleanupStagedDirectoriesRetainsUnjournaledStageWhenRecoveryTargetExists(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "conflicted-window")
	originalPath := filepath.Join(parentDir, "conflicted-window")
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(originalPath), "*")+"fixture")
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
	// 本平台，记录名与磁盘目录名不一致），且无 journal 的 versioned staged
	// 哈希无匹配候选——恢复目标不明，绝不能当作已提交删除 RemoveAll 掉媒体。
	seedStorageUserEntity(t, db, parentDir, "missing-active")
	// 注意：不创建 missing-active 目录，模拟目录缺失。
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(filepath.Join(parentDir, "other-name")), "*")+"fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "media.jpg"), []byte("keep"), 0600))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, stagedPath)
	assert.FileExists(t, filepath.Join(stagedPath, "media.jpg"))
}

func TestCleanupStagedDirectoriesRemovesZeroCandidateStageWhenAllActiveDirsExist(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	// 无 journal 的 versioned stage、哈希无匹配候选、且 parent 下所有 active
	// 目录都存在——此时 stage 是已提交删除的残留，应被清理。
	seedStorageUserEntity(t, db, parentDir, "active-user")
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, "active-user"), 0755))
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(filepath.Join(parentDir, "removed-user")), "*")+"fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Equal(t, 1, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.NoDirExists(t, stagedPath)
}

func TestCleanupStagedDirectoriesRejectsMismatchedJournalHash(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	originalPath := filepath.Join(parentDir, "expected")
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(filepath.Join(parentDir, "different")), "*")+"fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, database.CreateEntityRemovalJournal(db, database.EntityRemovalJournal{
		StagedPath:   stagedPath,
		OriginalPath: originalPath,
	}))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, stagedPath)
	journals, listErr := database.ListEntityRemovalJournals(db)
	require.NoError(t, listErr)
	assert.Len(t, journals, 1)
}

func TestCleanupStagedDirectoriesRemovesStaleJournal(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(filepath.Join(parentDir, "gone")), "*")+"fixture")
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
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(trimmedPath), "*")+"fixture")
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
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(originalPath), "*")+"fixture")
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

func TestCleanupStagedDirectoriesDeduplicatesSamePathCandidates(t *testing.T) {
	// 两条记录（不同 user_id）同名同 parent——归一化后指向同一目录。
	// 旧实现按 len(candidates)>1 判为歧义而永久保留；去重后应视为单一
	// 恢复目标，把中断删除的目录还原（两记录共享同一目录，恢复合理）。
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "same-name")
	require.NoError(t, database.CreateUser(db, &database.User{Id: 2, ScreenName: "second", Name: "Second", IsAccessible: true}))
	require.NoError(t, database.CreateUserEntity(db, &database.UserEntity{UserId: 2, Name: "same-name", ParentDir: parentDir}))
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(filepath.Join(parentDir, "same-name")), "*")+"fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "media.jpg"), []byte("keep"), 0600))

	cleanup, err := CleanupStagedDirectories(db)

	require.NoError(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Equal(t, 1, cleanup.Restored)
	assert.FileExists(t, filepath.Join(parentDir, "same-name", "media.jpg"))
	assert.NoDirExists(t, stagedPath)
}

func TestCleanupStagedDirectoriesRetainsZeroCandidateStageWithCrossPlatformHash(t *testing.T) {
	// H2 修复回归：跨平台 hash 失配（stage 在 Linux 用原样名 "foo." 创建，
	// Windows 扫描时 active 记录归一化为 "foo"）导致零候选；若 active 目录
	// 存在但 hash 不匹配，绝不能 RemoveAll 掉 staged 媒体——应保留。
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "foo.")
	// active 目录存在（Windows 上尾点归一化为 "foo"）
	require.NoError(t, os.Mkdir(filepath.Join(parentDir, "foo"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(parentDir, "foo", "active-media.jpg"), []byte("keep"), 0600))
	// staged 目录：hash 基于原样名 "foo."（Linux 创建，无 journal）
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(filepath.Join(parentDir, "foo.")), "*")+"fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(stagedPath, "staged-media.jpg"), []byte("keep"), 0600))

	cleanup, err := CleanupStagedDirectories(db)

	// 修复后：hash 归一化（TrimRight 尾点）使 stage 与 active 记录匹配，
	// 恢复目标已存在 → retain（不删除）。修复前：零候选 RemoveAll 删媒体。
	assert.Zero(t, cleanup.Removed, "staged media must not be removed while record is active")
	assert.DirExists(t, stagedPath)
	assert.FileExists(t, filepath.Join(stagedPath, "staged-media.jpg"))
	assert.FileExists(t, filepath.Join(parentDir, "foo", "active-media.jpg"))
	_ = err
}

func TestStagedDirectoryHashNormalizesTrailingDotsAndSpaces(t *testing.T) {
	// hash 计算必须剥离尾点/尾空格：Windows 上 "foo." 与 "foo" 是同一
	// 目录（storedEntityPath 归一化），stage 与扫描必须产生相同 hash，
	// 否则跨平台恢复失配。
	if got := stagedDirectoryNameHash("foo."); got != stagedDirectoryNameHash("foo") {
		t.Errorf("hash(\"foo.\") = %s != hash(\"foo\") = %s", got, stagedDirectoryNameHash("foo"))
	}
	if got := stagedDirectoryNameHash("foo "); got != stagedDirectoryNameHash("foo") {
		t.Errorf("hash(\"foo \") = %s != hash(\"foo\") = %s", got, stagedDirectoryNameHash("foo"))
	}
	if got := stagedDirectoryNameHash("foo.bar"); got == stagedDirectoryNameHash("foo") {
		t.Errorf("interior dot must not be stripped")
	}
}

func TestStagedDirectoryHashRoundTrip(t *testing.T) {
	pattern := stagedDirectoryPattern(filepath.Join(t.TempDir(), "entity-name"))
	name := strings.TrimSuffix(pattern, "*") + "fixture"

	hash, ok := parseStagedDirectoryHash(name)

	assert.True(t, ok)
	assert.Equal(t, stagedDirectoryNameHash("entity-name"), hash)
	_, malformed := parseStagedDirectoryHash(stagedDirectoryVersionPrefix + "not-a-hash-fixture")
	assert.False(t, malformed)
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
