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

func TestCleanupStagedDirectoriesRetainsAmbiguousVersionedStage(t *testing.T) {
	db := openStorageTestDB(t)
	parentDir := t.TempDir()
	seedStorageUserEntity(t, db, parentDir, "same-name")
	require.NoError(t, database.CreateUser(db, &database.User{Id: 2, ScreenName: "second", Name: "Second", IsAccessible: true}))
	require.NoError(t, database.CreateUserEntity(db, &database.UserEntity{UserId: 2, Name: "same-name", ParentDir: parentDir}))
	stagedPath := filepath.Join(parentDir, strings.TrimSuffix(stagedDirectoryPattern(filepath.Join(parentDir, "same-name")), "*")+"fixture")
	require.NoError(t, os.Mkdir(stagedPath, 0755))

	cleanup, err := CleanupStagedDirectories(db)

	assert.Error(t, err)
	assert.Zero(t, cleanup.Removed)
	assert.Zero(t, cleanup.Restored)
	assert.DirExists(t, stagedPath)
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
