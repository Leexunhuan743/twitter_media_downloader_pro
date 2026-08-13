package database

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"time"

	"github.com/jmoiron/sqlx"
)

type User struct {
	Id           uint64 `db:"id"`
	ScreenName   string `db:"screen_name"`
	Name         string `db:"name"`
	IsProtected  bool   `db:"protected"`
	FriendsCount int    `db:"friends_count"`
	IsAccessible bool   `db:"is_accessible"`
}

type UserEntity struct {
	Id                sql.NullInt32 `db:"id"`
	UserId            uint64        `db:"user_id"`
	Name              string        `db:"name"`
	LatestReleaseTime sql.NullTime  `db:"latest_release_time"`
	ParentDir         string        `db:"parent_dir"`
	MediaCount        sql.NullInt32 `db:"media_count"`
}

type UserLink struct {
	Id                int32  `db:"id" json:"id"`
	UserId            uint64 `db:"user_id" json:"user_id"`
	Name              string `db:"name" json:"name"`
	ParentLstEntityId int32  `db:"parent_lst_entity_id" json:"parent_lst_entity_id"`
}

// UserPreviousName 用户历史名称
type UserPreviousName struct {
	Id         int32     `db:"id" json:"id"`
	UserId     uint64    `db:"user_id" json:"user_id"`
	ScreenName string    `db:"screen_name" json:"screen_name"`
	Name       string    `db:"name" json:"name"`
	RecordDate time.Time `db:"record_date" json:"record_date"`
}

// UserPreviousNameWithCurrent 用户历史名称（含当前用户信息）
type UserPreviousNameWithCurrent struct {
	Id                int32     `db:"id"`
	UserId            uint64    `db:"user_id"`
	ScreenName        string    `db:"screen_name"`
	Name              string    `db:"name"`
	RecordDate        time.Time `db:"record_date"`
	CurrentScreenName string    `db:"current_screen_name"`
	CurrentName       string    `db:"current_name"`
}

type Lst struct {
	Id          uint64 `db:"id"`
	Name        string `db:"name"`
	OwnerUserId uint64 `db:"owner_user_id"`
}

type LstEntity struct {
	Id        sql.NullInt32 `db:"id"`
	LstId     int64         `db:"lst_id"`
	Name      string        `db:"name"`
	ParentDir string        `db:"parent_dir"`
}

// joinRecordPath 拼接实体记录的文件系统路径；ParentDir/Name 缺失时返回错误
// （kind 用于错误文案，如 "user"/"lst"）。
func joinRecordPath(parentDir, name, kind string) (string, error) {
	if parentDir == "" || name == "" {
		return "", fmt.Errorf("no enough info to get path for %s entity: parentDir=%q, name=%q", kind, parentDir, name)
	}
	return filepath.Join(parentDir, name), nil
}

func (le *LstEntity) Path() (string, error) {
	return joinRecordPath(le.ParentDir, le.Name, "lst")
}

func (ue *UserEntity) Path() (string, error) {
	return joinRecordPath(ue.ParentDir, ue.Name, "user")
}

func (ul *UserLink) Path(db *sqlx.DB) (string, error) {
	return ul.PathWithTx(db)
}

// PathWithTx 支持在事务中计算路径
func (ul *UserLink) PathWithTx(queryer interface {
	Get(dest interface{}, query string, args ...interface{}) error
}) (string, error) {
	le, err := GetLstEntityWithTx(queryer, int(ul.ParentLstEntityId))
	if err != nil {
		return "", err
	}
	if le == nil {
		return "", fmt.Errorf("parent lst was not exists")
	}

	lePath, err := le.Path()
	if err != nil {
		return "", err
	}
	return filepath.Join(lePath, ul.Name), nil
}

// NullInt32 辅助函数：将 sql.NullInt32 转换为 int32，无效值取 0。
// 注意与 sqlite_migration.go 的 nullInt32Value 语义不同：后者无效值返回 nil
// （用于 INSERT 绑定，让 SQLite 存储 NULL），此处 0 用于内存计算。
func NullInt32(n sql.NullInt32) int32 {
	if n.Valid {
		return n.Int32
	}
	return 0
}
