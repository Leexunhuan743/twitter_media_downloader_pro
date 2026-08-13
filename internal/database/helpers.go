package database

import (
	"database/sql"
	"fmt"

	"github.com/jmoiron/sqlx"
)

// withTx runs fn inside a single transaction, rolling back whenever fn or the
// final commit fails. This is the package's canonical transaction boilerplate;
// call sites must not hand-roll Beginx/Rollback/Commit sequences.
//
// 与 internal/database/tx 的 Manager.RunInTransaction 分工：withTx 是无 ctx 的
// 包内快速助手，供现有无 ctx 签名的数据库函数使用；Manager 是公共 ctx 感知
// 管理器（BeginTxx + commit 前 ctx 检查），供携带 context 的调用方（如
// downloading/list_sync.go）使用。不要新增第三套事务助手。
func withTx(db *sqlx.DB, fn func(tx *sqlx.Tx) error) (err error) {
	tx, err := db.Beginx()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	if err = fn(tx); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	return nil
}

func handleGetResultWithContext[T any](result *T, err error, format string, args ...any) (*T, error) {
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		args = append(args, err)
		return nil, fmt.Errorf(format, args...)
	}
	return result, nil
}

func handleInsertWithId(res sql.Result, err error, idScanner func(int64)) error {
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	idScanner(id)
	return nil
}
