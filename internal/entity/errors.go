package entity

import "errors"

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
