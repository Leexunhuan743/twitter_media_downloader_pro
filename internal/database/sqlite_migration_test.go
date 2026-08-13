package database

import (
	"os"
	"path/filepath"
	"testing"
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
