package database

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/jmoiron/sqlx"
)

// validIdent 允许的标识符：字母/数字/下划线，可选单级点号限定的
// "表.列" 形式（如 pn.screen_name）。两段都必须是合法标识符，
// 防止 SQL 注入。
var validIdent = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$`)

// countTableIdent 验证表名（支持可选的 JOIN 子句，用于 COUNT 子查询）。
// 此函数仅接受受信的字面量表名（来自同仓库 API 层），不可暴露给外部用户输入。
// ON 子句限制为列比较表达式（标识符、=、!=、<、>、空格、点号）。
var countTableIdent = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(?:\s+\w+)?(?:\s+(?:LEFT\s+)?JOIN\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+\w+)?(?:\s+ON\s+[A-Za-z0-9_.=<>\s!]+)?)?$`)

// QueryOptions 查询选项
type QueryOptions struct {
	Where   string
	Args    []interface{}
	OrderBy string
	Limit   int
	Offset  int
}

// Count 获取总数
func Count(db *sqlx.DB, table string, opts *QueryOptions) (int, error) {
	if !countTableIdent.MatchString(table) {
		return 0, fmt.Errorf("invalid table name: %q", table)
	}
	query := fmt.Sprintf("SELECT COUNT(*) FROM %s", table)
	if opts != nil && opts.Where != "" {
		query += " WHERE " + opts.Where
	}

	var count int
	var err error
	if opts != nil && len(opts.Args) > 0 {
		err = db.Get(&count, query, opts.Args...)
	} else {
		err = db.Get(&count, query)
	}
	return count, err
}

// BuildSearchCondition 构建搜索条件
func BuildSearchCondition(fields []string, keyword string) (string, []interface{}) {
	if keyword == "" || len(fields) == 0 {
		return "", nil
	}

	conditions := make([]string, 0, len(fields))
	args := make([]interface{}, 0, len(fields))
	for _, field := range fields {
		if !validIdent.MatchString(field) {
			continue
		}
		conditions = append(conditions, fmt.Sprintf("%s LIKE ?", field))
		args = append(args, "%"+keyword+"%")
	}
	if len(conditions) == 0 {
		return "", nil
	}

	return "(" + strings.Join(conditions, " OR ") + ")", args
}

// queryPage 执行分页 SELECT * 查询。table 必须通过 countTableIdent 白名单
// 校验（仅受信字面量表名），与 Count 使用同一套防注入约束。
func queryPage[T any](db *sqlx.DB, table string, where string, args []interface{}, orderBy string, limit, offset int) ([]T, error) {
	if !countTableIdent.MatchString(table) {
		return nil, fmt.Errorf("invalid table name: %q", table)
	}
	query := "SELECT * FROM " + table
	if where != "" {
		query += " WHERE " + where
	}
	if orderBy != "" {
		query += " " + orderBy
	}
	query += " LIMIT ? OFFSET ?"

	var results []T
	err := db.Select(&results, query, appendQueryArgs(args, limit, offset)...)
	return results, err
}

// QueryUsers 分页查询用户
func QueryUsers(db *sqlx.DB, where string, args []interface{}, orderBy string, limit, offset int) ([]User, error) {
	return queryPage[User](db, "users", where, args, orderBy, limit, offset)
}

// QueryLists 分页查询列表
func QueryLists(db *sqlx.DB, where string, args []interface{}, orderBy string, limit, offset int) ([]Lst, error) {
	return queryPage[Lst](db, "lsts", where, args, orderBy, limit, offset)
}

// QueryUserEntities 分页查询用户实体
func QueryUserEntities(db *sqlx.DB, where string, args []interface{}, orderBy string, limit, offset int) ([]UserEntity, error) {
	return queryPage[UserEntity](db, "user_entities", where, args, orderBy, limit, offset)
}

// QueryLstEntities 分页查询列表实体
func QueryLstEntities(db *sqlx.DB, where string, args []interface{}, orderBy string, limit, offset int) ([]LstEntity, error) {
	return queryPage[LstEntity](db, "lst_entities", where, args, orderBy, limit, offset)
}

// QueryUserLinks 查询用户链接
func QueryUserLinks(db *sqlx.DB, where string, args []interface{}, orderBy string, limit, offset int) ([]UserLink, error) {
	return queryPage[UserLink](db, "user_links", where, args, orderBy, limit, offset)
}

// QueryUserPreviousNames 查询用户历史名称
func QueryUserPreviousNames(db *sqlx.DB, uid uint64, limit, offset int) ([]UserPreviousName, error) {
	var names []UserPreviousName
	err := db.Select(&names,
		"SELECT * FROM user_previous_names WHERE user_id = ? ORDER BY record_date DESC LIMIT ? OFFSET ?",
		uid, limit, offset)
	return names, err
}

// QueryAllUserPreviousNames 全局查询用户历史名称（支持筛选、搜索、排序，JOIN users 获取当前名称）
func QueryAllUserPreviousNames(db *sqlx.DB, where string, args []interface{}, orderBy string, limit, offset int) ([]UserPreviousNameWithCurrent, error) {
	query := `SELECT pn.id, pn.user_id, pn.screen_name, pn.name, pn.record_date,
		u.screen_name AS current_screen_name, u.name AS current_name
		FROM user_previous_names pn
		LEFT JOIN users u ON pn.user_id = u.id`
	if where != "" {
		query += " WHERE " + where
	}
	if orderBy != "" {
		query += " " + orderBy
	} else {
		query += " ORDER BY pn.record_date DESC"
	}
	query += " LIMIT ? OFFSET ?"

	var names []UserPreviousNameWithCurrent
	err := db.Select(&names, query, appendQueryArgs(args, limit, offset)...)
	return names, err
}

// appendQueryArgs 将 limit/offset 追加到 args 的副本中，避免 append 可能
// 因 args 底层容量足够而修改原始切片。
func appendQueryArgs(args []interface{}, limit, offset int) []interface{} {
	queryArgs := make([]interface{}, 0, len(args)+2)
	queryArgs = append(queryArgs, args...)
	queryArgs = append(queryArgs, limit, offset)
	return queryArgs
}
