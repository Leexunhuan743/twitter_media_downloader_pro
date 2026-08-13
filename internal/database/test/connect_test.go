package database_test

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
)

func TestConnect_NewDatabase(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_new.db")

	db, err := database.Connect(dbPath)
	require.NoError(t, err)
	defer db.Close()

	assert.NotNil(t, db)

	_, err = os.Stat(dbPath)
	assert.NoError(t, err, "database file should be created")

	var count int
	err = db.Get(&count, "SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
	require.NoError(t, err)
	assert.Greater(t, count, 0, "tables should be created")
}

func TestConnect_ExistingDatabase(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_existing.db")

	db1, err := database.Connect(dbPath)
	require.NoError(t, err)

	usr := &database.User{
		Id:           1,
		ScreenName:   "testuser",
		Name:         "Test User",
		IsProtected:  false,
		FriendsCount: 100,
		IsAccessible: true,
	}
	err = database.CreateUser(db1, usr)
	require.NoError(t, err)
	db1.Close()

	db2, err := database.Connect(dbPath)
	require.NoError(t, err)
	defer db2.Close()

	retrieved, err := database.GetUserById(db2, 1)
	require.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.Equal(t, "testuser", retrieved.ScreenName)
}

func TestConnect_WALMode(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_wal.db")

	db, err := database.Connect(dbPath)
	require.NoError(t, err)
	defer db.Close()

	var journalMode string
	err = db.Get(&journalMode, "PRAGMA journal_mode")
	require.NoError(t, err)
	assert.Equal(t, "wal", journalMode, "database should be in WAL mode")
}

func TestConnect_InvalidPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("path semantics differ on Windows")
	}

	invalidPath := "/nonexistent/directory/test.db"

	db, err := database.Connect(invalidPath)
	assert.Error(t, err)
	assert.Nil(t, db)
}

func TestConnect_ConnectionPoolSettings(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_pool.db")

	db, err := database.Connect(dbPath)
	require.NoError(t, err)
	defer db.Close()

	assert.Equal(t, 1, db.Stats().MaxOpenConnections, "MaxOpenConns should be 1 for SQLite")
}

func TestConnect_RebuildsLegacySchema(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_legacy.db")

	legacyDB, err := sqlx.Connect(database.DriverName, database.MustFileDSN(dbPath, true))
	require.NoError(t, err)

	legacyDB.MustExec(`
CREATE TABLE users (
	id INTEGER NOT NULL,
	screen_name VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	protected BOOLEAN NOT NULL,
	friends_count INTEGER NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (screen_name)
);
`)
	legacyDB.MustExec(`INSERT INTO users(id, screen_name, name, protected, friends_count) VALUES(1, 'legacyuser', 'Legacy User', 0, 10)`)
	legacyDB.MustExec(`
CREATE TABLE entity_removal_journal (
	staged_path VARCHAR NOT NULL PRIMARY KEY,
	original_path VARCHAR NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`)
	legacyDB.MustExec(`INSERT INTO entity_removal_journal(staged_path, original_path) VALUES('/data/.tmd-remove-v1-fixture', '/data/entity')`)
	require.NoError(t, legacyDB.Close())

	db, err := database.Connect(dbPath)
	require.NoError(t, err)
	defer db.Close()

	retrieved, err := database.GetUserById(db, 1)
	require.NoError(t, err)
	require.NotNil(t, retrieved)
	assert.Equal(t, "legacyuser", retrieved.ScreenName)
	assert.True(t, retrieved.IsAccessible)
	journals, err := database.ListEntityRemovalJournals(db)
	require.NoError(t, err)
	require.Len(t, journals, 1)
	assert.Equal(t, "/data/.tmd-remove-v1-fixture", journals[0].StagedPath)
	assert.Equal(t, "/data/entity", journals[0].OriginalPath)

	backups, err := filepath.Glob(dbPath + ".backup.*")
	require.NoError(t, err)
	assert.NotEmpty(t, backups, "legacy database should be backed up before rebuild")
}

func TestConnect_RecoversOriginalAfterInterruptedReplacement(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test_replacement.db")
	db, err := database.Connect(dbPath)
	require.NoError(t, err)
	require.NoError(t, database.CreateUser(db, &database.User{
		Id:           1,
		ScreenName:   "preserved",
		Name:         "Preserved User",
		IsAccessible: true,
	}))
	require.NoError(t, db.Close())

	holdingPath := dbPath + ".replacing"
	for _, suffix := range []string{"", "-wal", "-shm"} {
		source := dbPath + suffix
		if _, statErr := os.Stat(source); os.IsNotExist(statErr) {
			continue
		} else {
			require.NoError(t, statErr)
		}
		require.NoError(t, os.Rename(source, holdingPath+suffix))
	}

	recovered, err := database.Connect(dbPath)
	require.NoError(t, err)
	defer recovered.Close()
	user, err := database.GetUserById(recovered, 1)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "preserved", user.ScreenName)
	_, statErr := os.Stat(holdingPath)
	assert.True(t, os.IsNotExist(statErr), "holding main file should be restored into place")
}

func TestConnect_RefusesBlankDatabaseAfterStrandedMigration(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test_stranded.db")
	require.NoError(t, os.WriteFile(dbPath+".migrating", []byte("uncommitted migration"), 0600))

	db, err := database.Connect(dbPath)

	assert.Nil(t, db)
	assert.Error(t, err)
	_, statErr := os.Stat(dbPath)
	assert.True(t, os.IsNotExist(statErr), "Connect must not create a blank replacement database")
}
