package database_test

import (
	"errors"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/unkmonster/tmd/internal/database"
)

func openRegressionDB(t *testing.T) *sqlx.DB {
	t.Helper()
	db, err := sqlx.Connect(database.DriverName, database.MemoryDSN(true))
	require.NoError(t, err)
	require.NoError(t, database.CreateTables(db))
	t.Cleanup(func() { db.Close() })
	return db
}

// 首次同步写入基线后紧接着改名，旧实现会再插一条完全相同的记录；并发首次
// 同步也会各写一条。去重后同一对名称只保留一条，真实改名链不受影响。
func TestRecordUserPreviousNameDeduplicatesConsecutive(t *testing.T) {
	db := openRegressionDB(t)
	require.NoError(t, database.CreateUser(db, &database.User{
		Id: 1, ScreenName: "alice", Name: "Alice", IsAccessible: true,
	}))

	require.NoError(t, database.RecordUserPreviousName(db, 1, "Alice", "alice"))
	require.NoError(t, database.RecordUserPreviousName(db, 1, "Alice", "alice"))

	names, err := database.QueryUserPreviousNames(db, 1, 10, 0)
	require.NoError(t, err)
	require.Len(t, names, 1, "连续重复的名称不应重复入库")

	// 真实改名链：Alice -> Bob -> Alice -> Bob 必须完整保留
	require.NoError(t, database.RecordUserPreviousName(db, 1, "Bob", "bob"))
	require.NoError(t, database.RecordUserPreviousName(db, 1, "Alice", "alice"))
	require.NoError(t, database.RecordUserPreviousName(db, 1, "Bob", "bob"))

	names, err = database.QueryUserPreviousNames(db, 1, 10, 0)
	require.NoError(t, err)
	assert.Len(t, names, 4)
}

func TestUpdateUserLinkReportsMissingRow(t *testing.T) {
	db := openRegressionDB(t)

	err := database.UpdateUserLink(db, 424242, "name")

	require.Error(t, err)
	assert.True(t, errors.Is(err, database.ErrUserLinkNotFound), "期望 ErrUserLinkNotFound, got %v", err)
}

func TestUpdateLstReportsMissingRow(t *testing.T) {
	db := openRegressionDB(t)

	err := database.UpdateLst(db, &database.Lst{Id: 424242, Name: "x", OwnerUserId: 1})

	require.Error(t, err)
	assert.True(t, errors.Is(err, database.ErrLstNotFound), "期望 ErrLstNotFound, got %v", err)
}

// PATCH 只更新显式提供的列：未提供的字段必须保持不变（避免与并发同步互相覆盖）。
func TestUpdateUserFieldsOnlyWritesProvidedColumns(t *testing.T) {
	db := openRegressionDB(t)
	require.NoError(t, database.CreateUser(db, &database.User{
		Id: 5, ScreenName: "keep", Name: "Keep", FriendsCount: 42, IsAccessible: true,
	}))

	require.NoError(t, database.UpdateUserFields(db, 5, map[string]interface{}{"friends_count": 7}))

	user, err := database.GetUserById(db, 5)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, 7, user.FriendsCount)
	assert.Equal(t, "keep", user.ScreenName, "未提供的列不得被覆盖")
	assert.Equal(t, "Keep", user.Name)
	assert.True(t, user.IsAccessible)
}

func TestUpdateUserFieldsRejectsUnknownColumn(t *testing.T) {
	db := openRegressionDB(t)
	require.NoError(t, database.CreateUser(db, &database.User{Id: 6, ScreenName: "u6", Name: "U6"}))

	err := database.UpdateUserFields(db, 6, map[string]interface{}{"password": "x"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported user field")
}

func TestUpdateUserFieldsReportsMissingRow(t *testing.T) {
	db := openRegressionDB(t)

	err := database.UpdateUserFields(db, 999, map[string]interface{}{"name": "ghost"})
	require.Error(t, err)
	assert.ErrorIs(t, err, database.ErrUserNotFound)
}
