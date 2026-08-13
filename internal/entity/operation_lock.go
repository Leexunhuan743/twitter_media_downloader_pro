package entity

import (
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

// operationParentDirKey 与 storage.go 的 comparablePath 同一归一化语义
// （Clean + Windows 小写），复用单一实现避免两处规则漂移。
func operationParentDirKey(parentDir string) string {
	return comparablePath(parentDir)
}
