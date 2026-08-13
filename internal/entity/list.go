package entity

import (
	"fmt"
	"path/filepath"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/unkmonster/tmd/internal/database"
)

// ListEntity represents a list's database record and storage directory.
type ListEntity struct {
	record  *database.LstEntity
	db      *sqlx.DB
	created bool
}

// NewListEntity loads the entity for lid and parentDir, or returns an unrecorded entity ready to create.
func NewListEntity(db *sqlx.DB, lid int64, parentDir string) (*ListEntity, error) {
	if db == nil {
		return nil, fmt.Errorf("create list entity: database is nil")
	}
	absParentDir, err := filepath.Abs(parentDir)
	if err != nil {
		return nil, fmt.Errorf("resolve list entity parent directory %q: %w", parentDir, err)
	}
	record, err := database.LocateLstEntity(db, lid, absParentDir)
	if err != nil {
		return nil, err
	}
	if record == nil {
		record = &database.LstEntity{LstId: lid, ParentDir: absParentDir}
		return &ListEntity{record: record, db: db}, nil
	}
	return &ListEntity{record: record, db: db, created: true}, nil
}

func (le *ListEntity) Create(name string) error {
	if err := le.requireRecord(); err != nil {
		return err
	}
	if le.db == nil {
		return fmt.Errorf("create %s: database is nil", le.description())
	}
	unlock := lockEntityOperation("list", strconv.FormatInt(le.record.LstId, 10), le.record.ParentDir)
	defer unlock()
	if le.created {
		return fmt.Errorf("%s already exists", le.description())
	}
	current, err := database.LocateLstEntity(le.db, le.record.LstId, le.record.ParentDir)
	if err != nil {
		return fmt.Errorf("check existing %s: %w", le.description(), err)
	}
	if current != nil {
		*le.record = *current
		le.created = true
		return fmt.Errorf("%s already exists", le.description())
	}
	path, err := entityPath(le.record.ParentDir, name)
	if err != nil {
		return fmt.Errorf("create %s: %w", le.description(), err)
	}
	change, err := ensureEntityDirectory(path)
	if err != nil {
		return err
	}
	// 无论目录是否本次新建都要检查归属：他人记录可能因归一化（遗留
	// 尾点/尾空格）或大小写变体映射到同一路径，且其目录当前缺失。
	owned, ownerErr := entityDirectoryOwnedByAnother(le.db, le.record.ParentDir, path, "list", uint64(le.record.LstId))
	if ownerErr != nil {
		// 归属检查查询失败（瞬时 SQLITE_BUSY/IO）：本次若新建了目录，
		// 必须回滚移除，否则残留孤儿空目录且无自愈机制。
		return change.rollback(fmt.Errorf("create %s: %w", le.description(), ownerErr))
	}
	if owned {
		// 目录归属冲突：若本次新建了目录，回滚移除，避免残留空目录。
		// 包 ErrPathConflict 使 API 层映射为 409（与目标已存在的冲突一致）。
		return change.rollback(fmt.Errorf("%w: create %s: directory %q already belongs to another entity", ErrPathConflict, le.description(), path))
	}

	oldName := le.record.Name
	oldID := le.record.Id
	le.record.Name = name
	if err := database.CreateLstEntity(le.db, le.record); err != nil {
		le.record.Name = oldName
		le.record.Id = oldID
		return change.rollback(fmt.Errorf("create %s database record: %w", le.description(), err))
	}
	le.created = true
	return nil
}

func (le *ListEntity) Remove() error {
	if err := le.requireRecord(); err != nil {
		return err
	}
	if le.db == nil {
		return fmt.Errorf("remove %s: database is nil", le.description())
	}
	unlock := lockEntityOperation("list", strconv.FormatInt(le.record.LstId, 10), le.record.ParentDir)
	defer unlock()
	if err := le.requireRecorded(); err != nil {
		return err
	}
	if err := le.refreshRecord(); err != nil {
		return err
	}
	path, err := le.Path()
	if err != nil {
		return fmt.Errorf("remove %s: %w", le.description(), err)
	}
	staged, err := stageEntityDirectoryRemoval(le.db, path)
	if err != nil {
		return err
	}
	if err := database.DelLstEntity(le.db, int(le.record.Id.Int32)); err != nil {
		return staged.rollback(le.db, fmt.Errorf("delete %s database record: %w", le.description(), TranslateError(err)))
	}

	le.created = false
	le.record.Id.Valid = false
	le.record.Id.Int32 = 0
	return staged.commit(le.db)
}

func (le *ListEntity) Rename(name string) error {
	if err := le.requireRecord(); err != nil {
		return err
	}
	if le.db == nil {
		return fmt.Errorf("rename %s: database is nil", le.description())
	}
	if err := ValidateName(name); err != nil {
		return err
	}
	unlock := lockEntityOperation("list", strconv.FormatInt(le.record.LstId, 10), le.record.ParentDir)
	defer unlock()
	if err := le.requireRecorded(); err != nil {
		return err
	}
	if err := le.refreshRecord(); err != nil {
		return err
	}
	if le.record.Name == name {
		path, err := le.Path()
		if err != nil {
			return err
		}
		_, err = ensureEntityDirectory(path)
		return err
	}

	oldName := le.record.Name
	// 新名归一化后若已被其他实体的记录占用，拒绝改名（同 user 侧）。
	targetPath, targetErr := entityPath(le.record.ParentDir, name)
	if targetErr != nil {
		return fmt.Errorf("rename %s: %w", le.description(), targetErr)
	}
	owned, ownerErr := entityDirectoryOwnedByAnother(le.db, le.record.ParentDir, targetPath, "list", uint64(le.record.LstId))
	if ownerErr != nil {
		return fmt.Errorf("rename %s: %w", le.description(), ownerErr)
	}
	if owned {
		return fmt.Errorf("%w: rename %s: target directory %q already belongs to another entity", ErrPathConflict, le.description(), targetPath)
	}

	change, err := renameEntityDirectory(le.record.ParentDir, oldName, name)
	if err != nil {
		return err
	}
	updated, err := database.UpdateLstEntityNameIfCurrent(le.db, int(le.record.Id.Int32), oldName, name)
	if err != nil {
		return change.rollback(fmt.Errorf("update %s database record: %w", le.description(), err))
	}
	if !updated {
		current, refreshErr := database.GetLstEntity(le.db, int(le.record.Id.Int32))
		if refreshErr != nil {
			return change.rollback(fmt.Errorf("verify %s after stale rename: %w", le.description(), refreshErr))
		}
		if current == nil {
			return change.rollback(fmt.Errorf("%w: %s no longer exists", ErrNotFound, le.description()))
		}
		return change.rollback(fmt.Errorf("%w: %s no longer has name %q", ErrConcurrentUpdate, le.description(), oldName))
	}
	le.record.Name = name
	return nil
}

func (le *ListEntity) Path() (string, error) {
	if err := le.requireRecord(); err != nil {
		return "", err
	}
	if le.created {
		return storedEntityPath(le.record.ParentDir, le.record.Name)
	}
	return entityPath(le.record.ParentDir, le.record.Name)
}

func (le *ListEntity) Name() (string, error) {
	if err := le.requireRecord(); err != nil {
		return "", err
	}
	if le.record.Name == "" {
		return "", fmt.Errorf("the name of %s is unset", le.description())
	}
	return le.record.Name, nil
}

func (le *ListEntity) Id() (int, error) {
	if err := le.requireRecorded(); err != nil {
		return 0, err
	}
	if !le.record.Id.Valid || le.record.Id.Int32 <= 0 {
		return 0, fmt.Errorf("%s has an invalid database id", le.description())
	}
	return int(le.record.Id.Int32), nil
}

func (le *ListEntity) Recorded() bool {
	return le != nil && le.record != nil && le.created
}

// NewListEntityFromRecord restores a list entity from an existing database record.
func NewListEntityFromRecord(db *sqlx.DB, record *database.LstEntity) *ListEntity {
	if record == nil {
		return nil
	}
	return &ListEntity{
		record:  record,
		db:      db,
		created: record.Id.Valid && record.Id.Int32 > 0,
	}
}

func (le *ListEntity) requireRecord() error {
	if le == nil || le.record == nil {
		return fmt.Errorf("list entity is nil or uninitialized")
	}
	return nil
}

func (le *ListEntity) requireRecorded() error {
	if err := le.requireRecord(); err != nil {
		return err
	}
	if !le.created {
		return fmt.Errorf("%s was not created", le.description())
	}
	return nil
}

func (le *ListEntity) refreshRecord() error {
	if !le.record.Id.Valid || le.record.Id.Int32 <= 0 {
		return fmt.Errorf("%s has an invalid database id", le.description())
	}
	current, err := database.GetLstEntity(le.db, int(le.record.Id.Int32))
	if err != nil {
		return fmt.Errorf("refresh %s: %w", le.description(), err)
	}
	if current == nil {
		return fmt.Errorf("%w: %s no longer exists", ErrNotFound, le.description())
	}
	if current.LstId != le.record.LstId || operationParentDirKey(current.ParentDir) != operationParentDirKey(le.record.ParentDir) {
		return fmt.Errorf("%w: stable identity changed for %s", ErrConcurrentUpdate, le.description())
	}
	*le.record = *current
	return nil
}

func (le *ListEntity) description() string {
	if le == nil || le.record == nil {
		return "list entity <nil>"
	}
	return fmt.Sprintf("list entity [%s:%d]", le.record.ParentDir, le.record.LstId)
}
