package database

import (
	"fmt"

	"github.com/jmoiron/sqlx"
)

func CreateLstEntity(db *sqlx.DB, entity *LstEntity) error {
	abs, err := normalizeEntityParentDir(entity.ParentDir)
	if err != nil {
		return fmt.Errorf("failed to get absolute path for parent dir %q: %w", entity.ParentDir, err)
	}
	entity.ParentDir = abs

	stmt := `INSERT INTO lst_entities(id, lst_id, name, parent_dir) VALUES(:id, :lst_id, :name, :parent_dir)`
	res, err := db.NamedExec(stmt, &entity)
	if err != nil {
		return fmt.Errorf("failed to create list entity for list %d in %q: %w", entity.LstId, entity.ParentDir, err)
	}
	return handleInsertWithId(res, err, func(id int64) { entity.Id.Scan(id) })
}

func DelLstEntity(db *sqlx.DB, id int) error {
	tx, err := db.Beginx()
	if err != nil {
		return fmt.Errorf("failed to begin list entity %d delete: %w", id, err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM user_links WHERE parent_lst_entity_id=?`, id); err != nil {
		return fmt.Errorf("failed to delete links for list entity %d: %w", id, err)
	}
	result, err := tx.Exec(`DELETE FROM lst_entities WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete list entity %d: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for list entity %d delete: %w", id, err)
	}
	if rows == 0 {
		return fmt.Errorf("%w: list entity %d", ErrEntityNotFound, id)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit list entity %d delete: %w", id, err)
	}
	return nil
}

func GetLstEntity(db *sqlx.DB, id int) (*LstEntity, error) {
	return GetLstEntityWithTx(db, id)
}

// GetLstEntityWithTx 支持在事务中查询 lst_entities
func GetLstEntityWithTx(queryer interface {
	Get(dest interface{}, query string, args ...interface{}) error
}, id int) (*LstEntity, error) {
	stmt := `SELECT * FROM lst_entities WHERE id=?`
	result := &LstEntity{}
	err := queryer.Get(result, stmt, id)
	return handleGetResultWithContext(result, err, "failed to get list entity %d: %w", id)
}

func LocateLstEntity(db *sqlx.DB, lid int64, parentDir string) (*LstEntity, error) {
	parentDir, err := normalizeEntityParentDir(parentDir)
	if err != nil {
		return nil, fmt.Errorf("failed to get absolute path for %q: %w", parentDir, err)
	}

	stmt := `SELECT * FROM lst_entities WHERE lst_id=? AND parent_dir=?`
	result := &LstEntity{}
	err = db.Get(result, stmt, lid, parentDir)
	return handleGetResultWithContext(result, err, "failed to locate list entity for list %d in %q: %w", lid, parentDir)
}

// UpdateLstEntityNameIfCurrent updates the name only when the caller's view is
// still current. A false result reports a stale write.
func UpdateLstEntityNameIfCurrent(db *sqlx.DB, id int, currentName, newName string) (bool, error) {
	result, err := db.Exec(`UPDATE lst_entities SET name=? WHERE id=? AND name=?`, newName, id, currentName)
	if err != nil {
		return false, fmt.Errorf("failed to rename list entity %d: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("failed to get rows affected for list entity %d rename: %w", id, err)
	}
	return rows == 1, nil
}
