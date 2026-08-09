package entity

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func entityPath(parentDir, name string) (string, error) {
	if parentDir == "" {
		return "", fmt.Errorf("entity parent directory is empty")
	}
	if err := ValidateName(name); err != nil {
		return "", err
	}
	return filepath.Join(parentDir, name), nil
}

// ValidateName ensures an entity name cannot escape its configured parent directory.
func ValidateName(name string) error {
	if name == "" || name == "." || name == ".." {
		return fmt.Errorf("%w: %q", ErrInvalidName, name)
	}
	if strings.ContainsRune(name, 0) || strings.ContainsAny(name, `/\`) || filepath.IsAbs(name) || filepath.Base(name) != name {
		return fmt.Errorf("%w: name must be a single path component: %q", ErrInvalidName, name)
	}
	return nil
}

type directoryChange struct {
	oldPath string
	newPath string
	moved   bool
	created bool
}

func ensureEntityDirectory(path string) (directoryChange, error) {
	change := directoryChange{newPath: path}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return change, fmt.Errorf("create entity parent directory %q: %w", filepath.Dir(path), err)
	}

	err := os.Mkdir(path, 0755)
	if err == nil {
		change.created = true
		return change, nil
	}
	if !os.IsExist(err) {
		return change, fmt.Errorf("create entity directory %q: %w", path, err)
	}

	info, statErr := os.Lstat(path)
	if statErr != nil {
		return change, fmt.Errorf("inspect existing entity directory %q: %w", path, statErr)
	}
	if !info.IsDir() {
		return change, fmt.Errorf("entity path %q exists and is not a directory", path)
	}
	return change, nil
}

func renameEntityDirectory(parentDir, oldName, newName string) (directoryChange, error) {
	oldPath, err := entityPath(parentDir, oldName)
	if err != nil {
		return directoryChange{}, fmt.Errorf("resolve current entity path: %w", err)
	}
	newPath, err := entityPath(parentDir, newName)
	if err != nil {
		return directoryChange{}, fmt.Errorf("resolve target entity path: %w", err)
	}
	if oldPath == newPath {
		return ensureEntityDirectory(oldPath)
	}

	oldInfo, err := os.Lstat(oldPath)
	if os.IsNotExist(err) {
		if _, targetErr := os.Lstat(newPath); targetErr == nil {
			return directoryChange{}, fmt.Errorf("%w: target path %q already exists", ErrPathConflict, newPath)
		} else if !os.IsNotExist(targetErr) {
			return directoryChange{}, fmt.Errorf("inspect target entity path %q: %w", newPath, targetErr)
		}
		return ensureEntityDirectory(newPath)
	}
	if err != nil {
		return directoryChange{}, fmt.Errorf("inspect current entity directory %q: %w", oldPath, err)
	}
	if !oldInfo.IsDir() {
		return directoryChange{}, fmt.Errorf("current entity path %q is not a directory", oldPath)
	}

	newInfo, newErr := os.Lstat(newPath)
	if newErr == nil && !os.SameFile(oldInfo, newInfo) {
		return directoryChange{}, fmt.Errorf("%w: target path %q already exists", ErrPathConflict, newPath)
	}
	if newErr != nil && !os.IsNotExist(newErr) {
		return directoryChange{}, fmt.Errorf("inspect target entity path %q: %w", newPath, newErr)
	}

	if err := os.Rename(oldPath, newPath); err != nil {
		return directoryChange{}, fmt.Errorf("rename entity directory from %q to %q: %w", oldPath, newPath, err)
	}
	return directoryChange{oldPath: oldPath, newPath: newPath, moved: true}, nil
}

func (c directoryChange) rollback(operationErr error) error {
	var rollbackErr error
	switch {
	case c.moved:
		rollbackErr = os.Rename(c.newPath, c.oldPath)
	case c.created:
		rollbackErr = os.Remove(c.newPath)
	}
	if rollbackErr == nil || os.IsNotExist(rollbackErr) {
		return operationErr
	}
	return errors.Join(operationErr, fmt.Errorf("rollback entity directory change: %w", rollbackErr))
}

type stagedDirectoryRemoval struct {
	originalPath string
	stagedPath   string
}

func stageEntityDirectoryRemoval(path string) (stagedDirectoryRemoval, error) {
	staged := stagedDirectoryRemoval{originalPath: path}
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return staged, nil
	}
	if err != nil {
		return staged, fmt.Errorf("inspect entity directory %q: %w", path, err)
	}
	if !info.IsDir() {
		return staged, fmt.Errorf("entity path %q is not a directory", path)
	}

	temp, err := os.CreateTemp(filepath.Dir(path), ".tmd-remove-")
	if err != nil {
		return staged, fmt.Errorf("reserve temporary entity path: %w", err)
	}
	tempPath := temp.Name()
	if closeErr := temp.Close(); closeErr != nil {
		_ = os.Remove(tempPath)
		return staged, fmt.Errorf("close temporary entity path %q: %w", tempPath, closeErr)
	}
	if err := os.Remove(tempPath); err != nil {
		return staged, fmt.Errorf("release temporary entity path %q: %w", tempPath, err)
	}
	if err := os.Rename(path, tempPath); err != nil {
		return staged, fmt.Errorf("stage entity directory %q for removal: %w", path, err)
	}
	staged.stagedPath = tempPath
	return staged, nil
}

func (s stagedDirectoryRemoval) rollback(operationErr error) error {
	if s.stagedPath == "" {
		return operationErr
	}
	if _, err := os.Lstat(s.originalPath); err == nil {
		return errors.Join(operationErr, fmt.Errorf("restore entity directory: destination %q already exists", s.originalPath))
	} else if !os.IsNotExist(err) {
		return errors.Join(operationErr, fmt.Errorf("inspect entity restore path %q: %w", s.originalPath, err))
	}
	if err := os.Rename(s.stagedPath, s.originalPath); err != nil {
		return errors.Join(operationErr, fmt.Errorf("restore entity directory %q: %w", s.originalPath, err))
	}
	return operationErr
}

func (s stagedDirectoryRemoval) commit() error {
	if s.stagedPath == "" {
		return nil
	}
	if err := os.RemoveAll(s.stagedPath); err != nil {
		return fmt.Errorf("remove staged entity directory %q: %w", s.stagedPath, err)
	}
	return nil
}
