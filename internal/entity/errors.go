package entity

import "errors"

var (
	// ErrInvalidName indicates that a name is empty or is not a single path component.
	ErrInvalidName = errors.New("invalid entity name")
	// ErrPathConflict indicates that a rename target already belongs to another path.
	ErrPathConflict = errors.New("entity path conflict")
)
