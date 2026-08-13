package entity

import (
	"errors"
	"fmt"

	"github.com/unkmonster/tmd/internal/database"
)

var (
	// ErrInvalidName indicates that a name is empty or is not a single path component.
	ErrInvalidName = errors.New("invalid entity name")
	// ErrPathConflict indicates that a rename target already belongs to another path.
	ErrPathConflict = errors.New("entity path conflict")
	// ErrConcurrentUpdate indicates that the database record changed during a storage operation.
	ErrConcurrentUpdate = errors.New("entity changed concurrently")
	// ErrNotFound indicates that a recorded entity disappeared before an operation committed.
	ErrNotFound = errors.New("entity not found")
)

// TranslateError maps database-layer sentinels onto entity-layer sentinels
// at the package boundary, so callers can match a single sentinel
// (entity.ErrNotFound) instead of duplicating database error checks. The
// replacement keeps the database message as the wrapped cause. It is
// idempotent: already-translated errors pass through unchanged.
func TranslateError(err error) error {
	if errors.Is(err, database.ErrEntityNotFound) {
		return fmt.Errorf("%w: %v", ErrNotFound, err)
	}
	return err
}
