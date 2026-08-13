package downloading

import (
	"path/filepath"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/unkmonster/tmd/internal/database"
)

func setupTestDB(t *testing.T) *sqlx.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	db, err := sqlx.Connect(database.DriverName, database.MustFileDSN(path, true))
	if err != nil {
		t.Fatalf("Failed to connect to test DB: %v", err)
	}
	if err := database.CreateTables(db); err != nil {
		t.Fatalf("Failed to create test tables: %v", err)
	}
	return db
}
