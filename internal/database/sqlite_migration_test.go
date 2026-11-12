package database

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReplaceSQLiteFiles_RestoresOriginalWhenMigratedFileMissing(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "foo.db")
	tempPath := filepath.Join(tmpDir, "foo.db.migrating")

	if err := os.WriteFile(dbPath, []byte("original"), 0600); err != nil {
		t.Fatalf("failed to create original database file: %v", err)
	}

	err := replaceSQLiteFiles(dbPath, tempPath)
	if err == nil {
		t.Fatal("replaceSQLiteFiles should fail when migrated database file is missing")
	}

	content, readErr := os.ReadFile(dbPath)
	if readErr != nil {
		t.Fatalf("original database file should be restored: %v", readErr)
	}
	if string(content) != "original" {
		t.Fatalf("original database content should be restored, got %q", string(content))
	}
}

func TestReplaceSQLiteFiles_ReplacesOriginalWithMigratedFile(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "foo.db")
	tempPath := filepath.Join(tmpDir, "foo.db.migrating")

	if err := os.WriteFile(dbPath, []byte("original"), 0600); err != nil {
		t.Fatalf("failed to create original database file: %v", err)
	}
	if err := os.WriteFile(tempPath, []byte("migrated"), 0600); err != nil {
		t.Fatalf("failed to create migrated database file: %v", err)
	}

	if err := replaceSQLiteFiles(dbPath, tempPath); err != nil {
		t.Fatalf("replaceSQLiteFiles failed: %v", err)
	}

	content, err := os.ReadFile(dbPath)
	if err != nil {
		t.Fatalf("failed to read replaced database file: %v", err)
	}
	if string(content) != "migrated" {
		t.Fatalf("database should be replaced with migrated content, got %q", string(content))
	}
	if _, err := os.Stat(tempPath); !os.IsNotExist(err) {
		t.Fatalf("migrated temp file should be moved away, stat err: %v", err)
	}
}

func TestRecoverInterruptedSQLiteReplacement_RestoresOriginalDatabase(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "foo.db")
	holdingPath := dbPath + ".replacing"
	tempPath := dbPath + ".migrating"

	if err := os.WriteFile(holdingPath, []byte("original"), 0600); err != nil {
		t.Fatalf("write replacement holding file: %v", err)
	}
	if err := os.WriteFile(holdingPath+"-wal", []byte("original wal"), 0600); err != nil {
		t.Fatalf("write replacement WAL file: %v", err)
	}
	if err := os.WriteFile(tempPath, []byte("uncommitted migration"), 0600); err != nil {
		t.Fatalf("write migration file: %v", err)
	}

	recovered, err := recoverInterruptedSQLiteReplacement(dbPath)
	if err != nil {
		t.Fatalf("recoverInterruptedSQLiteReplacement() error: %v", err)
	}
	if !recovered {
		t.Fatal("recoverInterruptedSQLiteReplacement() = false, want true")
	}
	content, err := os.ReadFile(dbPath)
	if err != nil {
		t.Fatalf("read restored database: %v", err)
	}
	if string(content) != "original" {
		t.Fatalf("restored database content = %q", string(content))
	}
	if _, err := os.Stat(dbPath + "-wal"); err != nil {
		t.Fatalf("restored database WAL: %v", err)
	}
	for _, path := range []string{holdingPath, tempPath} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("recovery artifact %q should be removed, stat err: %v", path, err)
		}
	}
}

func TestRecoverInterruptedSQLiteReplacement_RefusesStrandedMigrationTarget(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "foo.db")
	if err := os.WriteFile(dbPath+".migrating", []byte("uncommitted migration"), 0600); err != nil {
		t.Fatalf("write migration file: %v", err)
	}

	recovered, err := recoverInterruptedSQLiteReplacement(dbPath)
	if err == nil {
		t.Fatal("recoverInterruptedSQLiteReplacement() error = nil, want refusal")
	}
	if recovered {
		t.Fatal("recoverInterruptedSQLiteReplacement() recovered a database without an original")
	}
	if _, statErr := os.Stat(dbPath); !os.IsNotExist(statErr) {
		t.Fatalf("database path should remain absent, stat err: %v", statErr)
	}
}

// 0 字节文件是合法的空 SQLite 库：必须在 Connect 阶段直接建表，而不是走
// “validate 失败 → 重建 → copyUsers 找不到 users 表” 的永久失败路径。
func TestConnectInitializesEmptyDatabaseFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "empty.db")
	require.NoError(t, os.WriteFile(path, nil, 0600))

	db, err := Connect(path)
	require.NoError(t, err)
	defer db.Close()

	for _, table := range []string{"users", "user_entities"} {
		var count int
		require.NoError(t, db.Get(&count, "SELECT COUNT(*) FROM "+table), "table %s", table)
	}
}

// 迁移前的备份必须是可直接打开的一致性快照（VACUUM INTO 或回退复制）。
func TestBackupSQLiteFilesProducesOpenableCopy(t *testing.T) {
	path := filepath.Join(t.TempDir(), "source.db")
	db, err := Connect(path)
	require.NoError(t, err)
	require.NoError(t, CreateUser(db, &User{Id: 7, ScreenName: "backup", Name: "Backup"}))
	require.NoError(t, db.Close())

	backupPath, err := backupSQLiteFiles(path)
	require.NoError(t, err)
	t.Cleanup(func() { removeSQLiteFiles(backupPath) })

	backup, err := Connect(backupPath)
	require.NoError(t, err)
	defer backup.Close()
	user, err := GetUserById(backup, 7)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "backup", user.ScreenName)
}

// 同一时刻只允许一个实例做迁移；锁释放后可再次获取。
func TestAcquireMigrationLockSerializesInstances(t *testing.T) {
	path := filepath.Join(t.TempDir(), "locked.db")

	release, err := acquireMigrationLockFor(path, 50*time.Millisecond)
	require.NoError(t, err)

	_, err = acquireMigrationLockFor(path, 50*time.Millisecond)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "another instance is migrating")

	release()
	release2, err := acquireMigrationLockFor(path, 50*time.Millisecond)
	require.NoError(t, err)
	release2()
}

// 崩溃遗留的过期锁不应永久阻塞启动。
func TestAcquireMigrationLockReclaimsStaleLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stale.db")
	lockPath := path + migrationLockSuffix
	require.NoError(t, os.WriteFile(lockPath, []byte("999999\n"), 0600))
	old := time.Now().Add(-11 * time.Minute)
	require.NoError(t, os.Chtimes(lockPath, old, old))

	release, err := acquireMigrationLockFor(path, 50*time.Millisecond)
	require.NoError(t, err)
	release()
}
