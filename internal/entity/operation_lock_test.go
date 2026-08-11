package entity

import (
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEntityOperationLockSerializesSameKeyAndReleasesEntry(t *testing.T) {
	parentDir := t.TempDir()
	key := operationLockKey{kind: "user", ownerID: "1", parentDir: operationParentDirKey(parentDir)}
	unlockFirst := lockEntityOperation("user", "1", parentDir)
	attempting := make(chan struct{})
	acquired := make(chan struct{})
	done := make(chan struct{})
	go func() {
		close(attempting)
		unlockSecond := lockEntityOperation("user", "1", filepath.Join(parentDir, "."))
		close(acquired)
		unlockSecond()
		close(done)
	}()
	<-attempting
	require.Eventually(t, func() bool {
		operationLocks.Lock()
		defer operationLocks.Unlock()
		entry := operationLocks.entries[key]
		return entry != nil && entry.refs == 2
	}, time.Second, 5*time.Millisecond)
	select {
	case <-acquired:
		t.Fatal("same-key operation acquired before the current holder released it")
	default:
	}

	unlockFirst()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("waiting same-key operation did not acquire after release")
	}

	operationLocks.Lock()
	_, exists := operationLocks.entries[key]
	operationLocks.Unlock()
	assert.False(t, exists, "unused lock entry should be removed")
}

func TestEntityOperationLockKeepsDifferentKeysIndependent(t *testing.T) {
	parentDir := t.TempDir()
	unlockFirst := lockEntityOperation("user", "1", parentDir)
	defer unlockFirst()

	acquired := make(chan struct{})
	go func() {
		unlockSecond := lockEntityOperation("user", "2", parentDir)
		unlockSecond()
		close(acquired)
	}()

	select {
	case <-acquired:
	case <-time.After(time.Second):
		t.Fatal("different operation key was unnecessarily blocked")
	}
}

func TestEntityOperationLockReleasesAfterRecoveredPanic(t *testing.T) {
	parentDir := t.TempDir()
	func() {
		defer func() { _ = recover() }()
		unlock := lockEntityOperation("list", "1", parentDir)
		defer unlock()
		panic("test panic")
	}()

	unlock := lockEntityOperation("list", "1", parentDir)
	unlock()
}

func TestOperationParentDirKeyNormalizesPlatformPath(t *testing.T) {
	parentDir := t.TempDir()
	assert.Equal(t, operationParentDirKey(parentDir), operationParentDirKey(filepath.Join(parentDir, ".")))
	if runtime.GOOS == "windows" {
		assert.Equal(t, operationParentDirKey(parentDir), operationParentDirKey(strings.ToUpper(parentDir)))
	}
}
