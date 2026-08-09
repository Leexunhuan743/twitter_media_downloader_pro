package entity

import (
	"fmt"
	"path/filepath"

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
	if le.created {
		return fmt.Errorf("%s already exists", le.description())
	}
	if le.db == nil {
		return fmt.Errorf("create %s: database is nil", le.description())
	}
	path, err := entityPath(le.record.ParentDir, name)
	if err != nil {
		return fmt.Errorf("create %s: %w", le.description(), err)
	}
	change, err := ensureEntityDirectory(path)
	if err != nil {
		return err
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
	if err := le.requireRecorded(); err != nil {
		return err
	}
	if le.db == nil {
		return fmt.Errorf("remove %s: database is nil", le.description())
	}
	path, err := le.Path()
	if err != nil {
		return fmt.Errorf("remove %s: %w", le.description(), err)
	}
	staged, err := stageEntityDirectoryRemoval(path)
	if err != nil {
		return err
	}
	if err := database.DelLstEntity(le.db, int(le.record.Id.Int32)); err != nil {
		return staged.rollback(fmt.Errorf("delete %s database record: %w", le.description(), err))
	}

	le.created = false
	le.record.Id.Valid = false
	le.record.Id.Int32 = 0
	return staged.commit()
}

func (le *ListEntity) Rename(name string) error {
	if err := le.requireRecorded(); err != nil {
		return err
	}
	if le.db == nil {
		return fmt.Errorf("rename %s: database is nil", le.description())
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
	change, err := renameEntityDirectory(le.record.ParentDir, oldName, name)
	if err != nil {
		return err
	}
	le.record.Name = name
	if err := database.UpdateLstEntity(le.db, le.record); err != nil {
		le.record.Name = oldName
		return change.rollback(fmt.Errorf("update %s database record: %w", le.description(), err))
	}
	return nil
}

func (le *ListEntity) Path() (string, error) {
	if err := le.requireRecord(); err != nil {
		return "", err
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

func (le *ListEntity) description() string {
	if le == nil || le.record == nil {
		return "list entity <nil>"
	}
	return fmt.Sprintf("list entity [%s:%d]", le.record.ParentDir, le.record.LstId)
}
