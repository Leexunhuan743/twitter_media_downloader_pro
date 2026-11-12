package database

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
)

// ErrUserNotFound 标记"用户不存在"错误，供调用方用 errors.Is 判断。
var ErrUserNotFound = errors.New("user not found")

func CreateUser(db *sqlx.DB, usr *User) error {
	stmt := `INSERT INTO Users(id, screen_name, name, protected, friends_count, is_accessible) VALUES(:id, :screen_name, :name, :protected, :friends_count, :is_accessible)`
	_, err := db.NamedExec(stmt, usr)
	if err != nil {
		return fmt.Errorf("failed to create user %d (%s): %w", usr.Id, usr.ScreenName, err)
	}
	return nil
}

func GetUserById(db *sqlx.DB, uid uint64) (*User, error) {
	stmt := `SELECT * FROM users WHERE id=?`
	result := &User{}
	err := db.Get(result, stmt, uid)
	return handleGetResultWithContext(result, err, "failed to get user %d: %w", uid)
}

// GetUsersByIds 批量取 users，返回以 id 为键的映射。
func GetUsersByIds(db *sqlx.DB, uids []uint64) (map[uint64]*User, error) {
	result := make(map[uint64]*User, len(uids))
	if len(uids) == 0 {
		return result, nil
	}

	query, args, err := sqlx.In(`SELECT * FROM users WHERE id IN (?)`, uids)
	if err != nil {
		return nil, fmt.Errorf("failed to build batch user query: %w", err)
	}
	rows, err := db.Queryx(db.Rebind(query), args...)
	if err != nil {
		return nil, fmt.Errorf("failed to batch get users: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		record := &User{}
		if err := rows.StructScan(record); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		result[record.Id] = record
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read users: %w", err)
	}
	return result, nil
}

func SetUserAccessible(db *sqlx.DB, uid uint64, accessible bool) error {
	stmt := `UPDATE users SET is_accessible=? WHERE id=?`
	result, err := db.Exec(stmt, accessible, uid)
	if err != nil {
		return fmt.Errorf("failed to set accessible status for user %d: %w", uid, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for user %d: %w", uid, err)
	}
	if rows == 0 {
		return fmt.Errorf("user %d not found, cannot set accessible status: %w", uid, ErrUserNotFound)
	}
	return nil
}

func SetUserAccessibleByScreenName(db *sqlx.DB, screenName string, accessible bool) error {
	stmt := `UPDATE users SET is_accessible=? WHERE screen_name=?`
	result, err := db.Exec(stmt, accessible, screenName)
	if err != nil {
		return fmt.Errorf("failed to set accessible status for user %s: %w", screenName, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for user %s: %w", screenName, err)
	}
	if rows == 0 {
		return fmt.Errorf("user %s not found, cannot set accessible status: %w", screenName, ErrUserNotFound)
	}
	return nil
}

func UpdateUser(db *sqlx.DB, usr *User) error {
	stmt := `UPDATE users SET screen_name=:screen_name, name=:name, protected=:protected, friends_count=:friends_count, is_accessible=:is_accessible WHERE id=:id`
	res, err := db.NamedExec(stmt, usr)
	if err != nil {
		return fmt.Errorf("failed to update user %d: %w", usr.Id, err)
	}
	_, err = res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	return nil
}

// UpdateUserFields 只更新显式提供的列。PATCH 用它替代整行写回，避免与并发
// 同步（SyncUser）互相覆盖未涉及的字段。
func UpdateUserFields(db *sqlx.DB, id uint64, fields map[string]interface{}) error {
	if len(fields) == 0 {
		return nil
	}
	allowed := map[string]bool{
		"screen_name": true, "name": true, "protected": true,
		"friends_count": true, "is_accessible": true,
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		if !allowed[key] {
			return fmt.Errorf("unsupported user field %q", key)
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	sets := make([]string, 0, len(keys))
	args := make([]interface{}, 0, len(keys)+1)
	for _, key := range keys {
		sets = append(sets, key+" = ?")
		args = append(args, fields[key])
	}
	args = append(args, id)
	res, err := db.Exec("UPDATE users SET "+strings.Join(sets, ", ")+" WHERE id = ?", args...)
	if err != nil {
		return fmt.Errorf("failed to update user %d: %w", id, err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("user %d not found, cannot update: %w", id, ErrUserNotFound)
	}
	return nil
}

func SetUsersAccessible(db *sqlx.DB, uids []uint64) error {
	if len(uids) == 0 {
		return nil
	}

	query := `UPDATE users SET is_accessible=1 WHERE id IN (?)`
	query, args, err := sqlx.In(query, uids)
	if err != nil {
		return fmt.Errorf("failed to build batch update query: %w", err)
	}

	query = db.Rebind(query)
	_, err = db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to batch update users accessible status: %w", err)
	}
	return nil
}

func MarkListMembersAccessibleByIDs(db *sqlx.DB, uids []uint64) error {
	if len(uids) == 0 || db == nil {
		return nil
	}

	if err := SetUsersAccessible(db, uids); err != nil {
		return fmt.Errorf("failed to mark list members as accessible: %w", err)
	}
	return nil
}

func RecordUserPreviousName(db *sqlx.DB, uid uint64, name string, screenName string) error {
	// 与最新一条记录完全相同的名称不再重复插入：首次同步写入基线后，
	// 紧接着的第一次改名会再次写入同一对值；并发首次同步也会各写一条。
	// 在单条 SQL 内比较最新记录（按 id）既能去重，也避免 check-then-insert 竞态。
	stmt := `INSERT INTO user_previous_names(user_id, screen_name, name, record_date)
SELECT ?, ?, ?, ?
WHERE NOT EXISTS (
    SELECT 1 FROM user_previous_names
    WHERE id = (SELECT MAX(id) FROM user_previous_names WHERE user_id = ?)
      AND name = ? AND screen_name = ?
)`
	_, err := db.Exec(stmt, uid, screenName, name, time.Now(), uid, name, screenName)
	if err != nil {
		return fmt.Errorf("failed to record previous name for user %d (%s -> %s): %w", uid, screenName, name, err)
	}
	return nil
}

func MarkUserInaccessible(db *sqlx.DB, uid uint64, screenName string) {
	if uid > 0 {
		if markErr := SetUserAccessible(db, uid, false); markErr != nil {
			if !errors.Is(markErr, ErrUserNotFound) {
				log.Warnf("[db] User accessibility mark failed uid=%d accessible=false error=%q", uid, markErr.Error())
			}
		}
	} else if screenName != "" {
		if markErr := SetUserAccessibleByScreenName(db, screenName, false); markErr != nil {
			if !errors.Is(markErr, ErrUserNotFound) {
				log.Warnf("[db] User accessibility mark failed screen_name=%s accessible=false error=%q", screenName, markErr.Error())
			}
		}
	}
}

func DelUser(db *sqlx.DB, uid uint64) error {
	return withTx(db, func(tx *sqlx.Tx) error {
		if _, err := tx.Exec("DELETE FROM user_links WHERE user_id = ?", uid); err != nil {
			return fmt.Errorf("failed to delete user links for user %d: %w", uid, err)
		}
		if _, err := tx.Exec("DELETE FROM user_entities WHERE user_id = ?", uid); err != nil {
			return fmt.Errorf("failed to delete user entities for user %d: %w", uid, err)
		}
		if _, err := tx.Exec("DELETE FROM user_previous_names WHERE user_id = ?", uid); err != nil {
			return fmt.Errorf("failed to delete previous names for user %d: %w", uid, err)
		}
		if _, err := tx.Exec("DELETE FROM users WHERE id = ?", uid); err != nil {
			return fmt.Errorf("failed to delete user %d: %w", uid, err)
		}
		return nil
	})
}
