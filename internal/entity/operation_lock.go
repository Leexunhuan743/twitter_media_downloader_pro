package entity

import (
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

type operationLockKey struct {
	kind      string
	ownerID   string
	parentDir string
}

type operationLockEntry struct {
	mu   sync.Mutex
	refs int
}

var operationLocks = struct {
	sync.Mutex
	entries map[operationLockKey]*operationLockEntry
}{entries: make(map[operationLockKey]*operationLockEntry)}

func lockEntityOperation(kind, ownerID, parentDir string) func() {
	key := operationLockKey{
		kind:      kind,
		ownerID:   ownerID,
		parentDir: operationParentDirKey(parentDir),
	}

	operationLocks.Lock()
	entry := operationLocks.entries[key]
	if entry == nil {
		entry = &operationLockEntry{}
		operationLocks.entries[key] = entry
	}
	entry.refs++
	operationLocks.Unlock()

	entry.mu.Lock()
	return func() {
		entry.mu.Unlock()
		operationLocks.Lock()
		entry.refs--
		if entry.refs == 0 {
			delete(operationLocks.entries, key)
		}
		operationLocks.Unlock()
	}
}

func operationParentDirKey(parentDir string) string {
	key := filepath.Clean(parentDir)
	if runtime.GOOS == "windows" {
		key = strings.ToLower(key)
	}
	return key
}
