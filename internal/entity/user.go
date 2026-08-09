package entity

import (
	"fmt"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/unkmonster/tmd/internal/database"
)

// UserEntity represents a user's database record and storage directory.
type UserEntity struct {
	record  *database.UserEntity
	db      *sqlx.DB
	created bool
}

// NewUserEntity loads the entity for uid and parentDir, or returns an unrecorded entity ready to create.
func NewUserEntity(db *sqlx.DB, uid uint64, parentDir string) (*UserEntity, error) {
	if db == nil {
		return nil, fmt.Errorf("create user entity: database is nil")
	}
	absParentDir, err := filepath.Abs(parentDir)
	if err != nil {
		return nil, fmt.Errorf("resolve user entity parent directory %q: %w", parentDir, err)
	}
	record, err := database.LocateUserEntity(db, uid, absParentDir)
	if err != nil {
		return nil, err
	}
	if record == nil {
		record = &database.UserEntity{UserId: uid, ParentDir: absParentDir}
		return &UserEntity{record: record, db: db}, nil
	}
	return &UserEntity{record: record, db: db, created: true}, nil
}

func (ue *UserEntity) Create(name string) error {
	if err := ue.requireRecord(); err != nil {
		return err
	}
	if ue.db == nil {
		return fmt.Errorf("create %s: database is nil", ue.description())
	}
	unlock := lockEntityOperation("user", strconv.FormatUint(ue.record.UserId, 10), ue.record.ParentDir)
	defer unlock()
	if ue.created {
		return fmt.Errorf("%s already exists", ue.description())
	}
	current, err := database.LocateUserEntity(ue.db, ue.record.UserId, ue.record.ParentDir)
	if err != nil {
		return fmt.Errorf("check existing %s: %w", ue.description(), err)
	}
	if current != nil {
		*ue.record = *current
		ue.created = true
		return fmt.Errorf("%s already exists", ue.description())
	}
	path, err := entityPath(ue.record.ParentDir, name)
	if err != nil {
		return fmt.Errorf("create %s: %w", ue.description(), err)
	}
	change, err := ensureEntityDirectory(path)
	if err != nil {
		return err
	}

	oldName := ue.record.Name
	oldID := ue.record.Id
	ue.record.Name = name
	if err := database.CreateUserEntity(ue.db, ue.record); err != nil {
		ue.record.Name = oldName
		ue.record.Id = oldID
		return change.rollback(fmt.Errorf("create %s database record: %w", ue.description(), err))
	}
	ue.created = true
	return nil
}

func (ue *UserEntity) Remove() error {
	if err := ue.requireRecord(); err != nil {
		return err
	}
	if ue.db == nil {
		return fmt.Errorf("remove %s: database is nil", ue.description())
	}
	unlock := lockEntityOperation("user", strconv.FormatUint(ue.record.UserId, 10), ue.record.ParentDir)
	defer unlock()
	if err := ue.requireRecorded(); err != nil {
		return err
	}
	if err := ue.refreshRecord(); err != nil {
		return err
	}
	path, err := ue.Path()
	if err != nil {
		return fmt.Errorf("remove %s: %w", ue.description(), err)
	}
	staged, err := stageEntityDirectoryRemoval(path)
	if err != nil {
		return err
	}
	if err := database.DelUserEntity(ue.db, uint32(ue.record.Id.Int32)); err != nil {
		return staged.rollback(fmt.Errorf("delete %s database record: %w", ue.description(), err))
	}

	ue.created = false
	ue.record.Id.Valid = false
	ue.record.Id.Int32 = 0
	return staged.commit()
}

func (ue *UserEntity) Rename(name string) error {
	if err := ue.requireRecord(); err != nil {
		return err
	}
	if ue.db == nil {
		return fmt.Errorf("rename %s: database is nil", ue.description())
	}
	if err := ValidateName(name); err != nil {
		return err
	}
	unlock := lockEntityOperation("user", strconv.FormatUint(ue.record.UserId, 10), ue.record.ParentDir)
	defer unlock()
	if err := ue.requireRecorded(); err != nil {
		return err
	}
	if err := ue.refreshRecord(); err != nil {
		return err
	}
	if ue.record.Name == name {
		path, err := ue.Path()
		if err != nil {
			return err
		}
		_, err = ensureEntityDirectory(path)
		return err
	}

	oldName := ue.record.Name
	change, err := renameEntityDirectory(ue.record.ParentDir, oldName, name)
	if err != nil {
		return err
	}
	updated, err := database.UpdateUserEntityNameIfCurrent(ue.db, int(ue.record.Id.Int32), oldName, name)
	if err != nil {
		return change.rollback(fmt.Errorf("update %s database record: %w", ue.description(), err))
	}
	if !updated {
		current, refreshErr := database.GetUserEntity(ue.db, int(ue.record.Id.Int32))
		if refreshErr != nil {
			return change.rollback(fmt.Errorf("verify %s after stale rename: %w", ue.description(), refreshErr))
		}
		if current == nil {
			return change.rollback(fmt.Errorf("%w: %s no longer exists", ErrNotFound, ue.description()))
		}
		return change.rollback(fmt.Errorf("%w: %s no longer has name %q", ErrConcurrentUpdate, ue.description(), oldName))
	}
	ue.record.Name = name
	return nil
}

func (ue *UserEntity) Path() (string, error) {
	if err := ue.requireRecord(); err != nil {
		return "", err
	}
	return entityPath(ue.record.ParentDir, ue.record.Name)
}

// ParentDir returns the storage parent used when a profile path is not yet available.
func (ue *UserEntity) ParentDir() string {
	if ue == nil || ue.record == nil {
		return ""
	}
	return ue.record.ParentDir
}

func (ue *UserEntity) Name() (string, error) {
	if err := ue.requireRecord(); err != nil {
		return "", err
	}
	if ue.record.Name == "" {
		return "", fmt.Errorf("the name of %s is unset", ue.description())
	}
	return ue.record.Name, nil
}

func (ue *UserEntity) Id() (int, error) {
	if err := ue.requireRecorded(); err != nil {
		return 0, err
	}
	if !ue.record.Id.Valid || ue.record.Id.Int32 <= 0 {
		return 0, fmt.Errorf("%s has an invalid database id", ue.description())
	}
	return int(ue.record.Id.Int32), nil
}

func (ue *UserEntity) LatestReleaseTime() (time.Time, error) {
	if err := ue.requireRecorded(); err != nil {
		return time.Time{}, err
	}
	return ue.record.LatestReleaseTime.Time, nil
}

func (ue *UserEntity) SetLatestReleaseTime(t time.Time) error {
	if err := ue.requireRecorded(); err != nil {
		return err
	}
	if ue.db == nil {
		return fmt.Errorf("set latest release time for %s: database is nil", ue.description())
	}
	err := database.SetUserEntityLatestReleaseTime(ue.db, int(ue.record.Id.Int32), t)
	if err == nil {
		ue.record.LatestReleaseTime.Time = t
		ue.record.LatestReleaseTime.Valid = true
	}
	return err
}

func (ue *UserEntity) ClearLatestReleaseTime() error {
	if err := ue.requireRecorded(); err != nil {
		return err
	}
	if ue.db == nil {
		return fmt.Errorf("clear latest release time for %s: database is nil", ue.description())
	}
	err := database.ClearUserEntityLatestReleaseTime(ue.db, int(ue.record.Id.Int32))
	if err == nil {
		ue.record.LatestReleaseTime.Valid = false
		ue.record.LatestReleaseTime.Time = time.Time{}
	}
	return err
}

func (ue *UserEntity) UserId() uint64 {
	if ue == nil || ue.record == nil {
		return 0
	}
	return ue.record.UserId
}

func (ue *UserEntity) Recorded() bool {
	return ue != nil && ue.record != nil && ue.created
}

func (ue *UserEntity) MediaCount() int32 {
	if ue == nil || ue.record == nil || !ue.record.MediaCount.Valid {
		return 0
	}
	return ue.record.MediaCount.Int32
}

// MediaCountValid reports whether media_count is present in the database record.
func (ue *UserEntity) MediaCountValid() bool {
	return ue != nil && ue.record != nil && ue.record.MediaCount.Valid
}

// NewUserEntityFromRecord restores a user entity from an existing database record.
func NewUserEntityFromRecord(db *sqlx.DB, record *database.UserEntity) *UserEntity {
	if record == nil {
		return nil
	}
	return &UserEntity{
		record:  record,
		db:      db,
		created: record.Id.Valid && record.Id.Int32 > 0,
	}
}

func (ue *UserEntity) requireRecord() error {
	if ue == nil || ue.record == nil {
		return fmt.Errorf("user entity is nil or uninitialized")
	}
	return nil
}

func (ue *UserEntity) requireRecorded() error {
	if err := ue.requireRecord(); err != nil {
		return err
	}
	if !ue.created {
		return fmt.Errorf("%s was not created", ue.description())
	}
	return nil
}

func (ue *UserEntity) refreshRecord() error {
	if !ue.record.Id.Valid || ue.record.Id.Int32 <= 0 {
		return fmt.Errorf("%s has an invalid database id", ue.description())
	}
	current, err := database.GetUserEntity(ue.db, int(ue.record.Id.Int32))
	if err != nil {
		return fmt.Errorf("refresh %s: %w", ue.description(), err)
	}
	if current == nil {
		return fmt.Errorf("%w: %s no longer exists", ErrNotFound, ue.description())
	}
	if current.UserId != ue.record.UserId || operationParentDirKey(current.ParentDir) != operationParentDirKey(ue.record.ParentDir) {
		return fmt.Errorf("%w: stable identity changed for %s", ErrConcurrentUpdate, ue.description())
	}
	*ue.record = *current
	return nil
}

func (ue *UserEntity) description() string {
	if ue == nil || ue.record == nil {
		return "user entity <nil>"
	}
	return fmt.Sprintf("user entity [%s:%d]", ue.record.ParentDir, ue.record.UserId)
}
