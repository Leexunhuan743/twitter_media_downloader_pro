package database

import "errors"

// ErrEntityNotFound indicates that a database entity disappeared before a mutation committed.
var ErrEntityNotFound = errors.New("database entity not found")
