package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

func CreateUserEntity(db *sqlx.DB, entity *UserEntity) error {
	abs, err := normalizeEntityParentDir(entity.ParentDir)
	if err != nil {
		return fmt.Errorf("failed to get absolute path for parent dir %q: %w", entity.ParentDir, err)
	}
	entity.ParentDir = abs

	stmt := `INSERT INTO user_entities(user_id, name, parent_dir) VALUES(:user_id, :name, :parent_dir)`
	res, err := db.NamedExec(stmt, entity)
	if err != nil {
		return fmt.Errorf("failed to create user entity for user %d in %q: %w", entity.UserId, entity.ParentDir, err)
	}
	return handleInsertWithId(res, err, func(id int64) { entity.Id.Scan(id) })
}

func DelUserEntity(db *sqlx.DB, id uint32) error {
	stmt := `DELETE FROM user_entities WHERE id=?`
	result, err := db.Exec(stmt, id)
	if err != nil {
		return fmt.Errorf("failed to delete user entity %d: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for user entity %d delete: %w", id, err)
	}
	if rows == 0 {
		return fmt.Errorf("%w: user entity %d", ErrEntityNotFound, id)
	}
	return nil
}

func LocateUserEntity(db *sqlx.DB, uid uint64, parentDIr string) (*UserEntity, error) {
	parentDIr, err := normalizeEntityParentDir(parentDIr)
	if err != nil {
		return nil, fmt.Errorf("failed to get absolute path for %q: %w", parentDIr, err)
	}

	stmt := `SELECT * FROM user_entities WHERE user_id=? AND parent_dir=?`
	result := &UserEntity{}
	err = db.Get(result, stmt, uid, parentDIr)
	return handleGetResultWithContext(result, err, "failed to locate user entity for user %d in %q: %w", uid, parentDIr)
}

func GetUserEntity(db *sqlx.DB, id int) (*UserEntity, error) {
	result := &UserEntity{}
	stmt := `SELECT * FROM user_entities WHERE id=?`
	err := db.Get(result, stmt, id)
	return handleGetResultWithContext(result, err, "failed to get user entity %d: %w", id)
}

// UpdateUserEntityNameIfCurrent updates only the directory-backed name when
// the caller's view is still current. A false result reports a stale write.
func UpdateUserEntityNameIfCurrent(db *sqlx.DB, id int, currentName, newName string) (bool, error) {
	result, err := db.Exec(`UPDATE user_entities SET name=? WHERE id=? AND name=?`, newName, id, currentName)
	if err != nil {
		return false, fmt.Errorf("failed to rename user entity %d: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("failed to get rows affected for user entity %d rename: %w", id, err)
	}
	return rows == 1, nil
}

// UpdateUserEntityMetadata atomically updates only the optional statistics
// supplied by the caller. A nil pointer leaves that column unchanged.
// At least one of mediaCount / latestReleaseTime must be non-nil; the PATCH
// handler reaches this only when a statistics field is present, and an empty
// SET list would not be valid SQL anyway.
// Timestamps are normalized to UTC so the stored TEXT order matches the
// instant order (see NormalizeLegacyTimestamps).
func UpdateUserEntityMetadata(db *sqlx.DB, id int, mediaCount *int32, latestReleaseTime *sql.NullTime) error {
	setClauses := make([]string, 0, 2)
	args := make([]interface{}, 0, 3)
	if mediaCount != nil {
		setClauses = append(setClauses, "media_count=?")
		args = append(args, *mediaCount)
	}
	if latestReleaseTime != nil {
		normalized := NormalizeNullTime(*latestReleaseTime)
		setClauses = append(setClauses, "latest_release_time=?")
		args = append(args, normalized)
	}
	args = append(args, id)
	result, err := db.Exec(`UPDATE user_entities SET `+strings.Join(setClauses, ", ")+` WHERE id=?`, args...)
	if err != nil {
		return fmt.Errorf("failed to update user entity %d metadata: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for user entity %d metadata update: %w", id, err)
	}
	if rows == 0 {
		return fmt.Errorf("%w: user entity %d", ErrEntityNotFound, id)
	}
	return nil
}

func UpdateUserEntityMediCount(db *sqlx.DB, eid int, count int) error {
	stmt := `UPDATE user_entities SET media_count=? WHERE id=?`
	result, err := db.Exec(stmt, count, eid)
	if err != nil {
		return fmt.Errorf("failed to update media count for user entity %d: %w", eid, err)
	}
	_, err = result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	return nil
}

func UpdateUserEntityTweetStat(db *sqlx.DB, eid int, baseline time.Time, count int) error {
	// Normalize to UTC so the stored TEXT comparison in the CASE WHEN clauses
	// follows instant order even when older rows carry a zone offset.
	baseline = NormalizeTime(baseline)
	stmt := `UPDATE user_entities
SET latest_release_time=CASE
		WHEN latest_release_time IS NULL OR latest_release_time < ? THEN ?
		ELSE latest_release_time
	END,
	media_count=CASE
		WHEN media_count IS NULL OR media_count < ? THEN ?
		ELSE media_count
	END
WHERE id=?`
	result, err := db.Exec(stmt, baseline, baseline, count, count, eid)
	if err != nil {
		return fmt.Errorf("failed to update tweet stat for user entity %d: %w", eid, err)
	}
	_, err = result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	return nil
}

func SetUserEntityLatestReleaseTime(db *sqlx.DB, id int, t time.Time) error {
	// Store in UTC so the TEXT order matches the instant order.
	t = NormalizeTime(t)
	stmt := `UPDATE user_entities SET latest_release_time=? WHERE id=?`
	result, err := db.Exec(stmt, t, id)
	if err != nil {
		return fmt.Errorf("failed to set latest release time for user entity %d: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for user entity %d: %w", id, err)
	}
	if rows == 0 {
		return fmt.Errorf("no user entity found with id %d", id)
	}
	return nil
}

func ClearUserEntityLatestReleaseTime(db *sqlx.DB, id int) error {
	stmt := `UPDATE user_entities SET latest_release_time=NULL WHERE id=?`
	result, err := db.Exec(stmt, id)
	if err != nil {
		return fmt.Errorf("failed to clear latest release time for user entity %d: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for user entity %d: %w", id, err)
	}
	if rows == 0 {
		return fmt.Errorf("no user entity found with id %d", id)
	}
	return nil
}
