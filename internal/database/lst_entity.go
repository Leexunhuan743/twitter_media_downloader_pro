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

	// 注意：与 CreateUserEntity 不同，lst_entities 支持调用方显式指定 Id
	// （测试契约 create_with_explicit_id），因此 INSERT 必须携带 :id 列；
	// Id 无效时 SQLite 自动分配 rowid。NamedExec 传记录本身而非二级指针。
	stmt := `INSERT INTO lst_entities(id, lst_id, name, parent_dir) VALUES(:id, :lst_id, :name, :parent_dir)`
	res, err := db.NamedExec(stmt, entity)
	if err != nil {
		return fmt.Errorf("failed to create list entity for list %d in %q: %w", entity.LstId, entity.ParentDir, err)
	}
	return handleInsertWithId(res, err, func(id int64) { entity.Id.Scan(id) })
}

func DelLstEntity(db *sqlx.DB, id int) error {
	return withTx(db, func(tx *sqlx.Tx) error {
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
		return nil
	})
}

func GetLstEntity(db *sqlx.DB, id int) (*LstEntity, error) {
	return GetLstEntityWithTx(db, id)
}

// GetLstEntitiesByIDs 批量取 lst_entities，返回以 id 为键的映射。
func GetLstEntitiesByIDs(db *sqlx.DB, ids []int) (map[int]*LstEntity, error) {
	result := make(map[int]*LstEntity, len(ids))
	if len(ids) == 0 {
		return result, nil
	}

	query, args, err := sqlx.In(`SELECT * FROM lst_entities WHERE id IN (?)`, ids)
	if err != nil {
		return nil, fmt.Errorf("failed to build batch list entity query: %w", err)
	}
	rows, err := db.Queryx(db.Rebind(query), args...)
	if err != nil {
		return nil, fmt.Errorf("failed to batch get list entities: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		record := &LstEntity{}
		if err := rows.StructScan(record); err != nil {
			return nil, fmt.Errorf("failed to scan list entity: %w", err)
		}
		if record.Id.Valid {
			result[int(record.Id.Int32)] = record
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read list entities: %w", err)
	}
	return result, nil
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
