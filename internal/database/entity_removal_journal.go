package database

import (
	"fmt"

	"github.com/jmoiron/sqlx"
)

// EntityRemovalJournal records a sibling directory staged for entity removal.
// It survives a process crash between the filesystem rename and final cleanup.
type EntityRemovalJournal struct {
	StagedPath   string `db:"staged_path"`
	OriginalPath string `db:"original_path"`
}

func CreateEntityRemovalJournal(db *sqlx.DB, journal EntityRemovalJournal) error {
	if db == nil {
		return fmt.Errorf("create entity removal journal: database is nil")
	}
	if journal.StagedPath == "" || journal.OriginalPath == "" {
		return fmt.Errorf("create entity removal journal: paths cannot be empty")
	}
	if _, err := db.NamedExec(`
		INSERT INTO entity_removal_journal(staged_path, original_path)
		VALUES(:staged_path, :original_path)
	`, &journal); err != nil {
		return fmt.Errorf("create entity removal journal for %q: %w", journal.StagedPath, err)
	}
	return nil
}

func DeleteEntityRemovalJournal(db *sqlx.DB, stagedPath string) error {
	if db == nil {
		return fmt.Errorf("delete entity removal journal: database is nil")
	}
	if _, err := db.Exec(`DELETE FROM entity_removal_journal WHERE staged_path=?`, stagedPath); err != nil {
		return fmt.Errorf("delete entity removal journal for %q: %w", stagedPath, err)
	}
	return nil
}

func ListEntityRemovalJournals(db *sqlx.DB) ([]EntityRemovalJournal, error) {
	if db == nil {
		return nil, fmt.Errorf("list entity removal journals: database is nil")
	}
	var journals []EntityRemovalJournal
	if err := db.Select(&journals, `
		SELECT staged_path, original_path
		FROM entity_removal_journal
		ORDER BY staged_path
	`); err != nil {
		return nil, fmt.Errorf("list entity removal journals: %w", err)
	}
	return journals, nil
}
