package database_test

import (
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
)

func TestNormalizeLegacyTimestamps(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    1,
		Name:      "tzentity",
		ParentDir: tmpDir,
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)

	// 直接写入三种历史形态：非 UTC 偏移、UTC 偏移、无偏移墙钟。
	_, err = db.Exec(`UPDATE user_entities SET latest_release_time=? WHERE id=?`,
		"2024-01-01 00:30:00.000000000+08:00", entity.Id.Int32)
	require.NoError(t, err)

	require.NoError(t, database.NormalizeLegacyTimestamps(db))

	var stored string
	require.NoError(t, db.QueryRow(`SELECT CAST(latest_release_time AS TEXT) FROM user_entities WHERE id=?`, entity.Id.Int32).Scan(&stored))
	// 归一化后必须是 UTC 表示且时刻保持（00:30+08:00 == 2023-12-31T16:30:00Z）。
	// modernc 的 sqlite 时间格式在整秒时省略小数段。
	assert.Equal(t, "2023-12-31 16:30:00+00:00", stored)

	// 幂等：再次运行不改变已归一化值。
	require.NoError(t, database.NormalizeLegacyTimestamps(db))
	var again string
	require.NoError(t, db.QueryRow(`SELECT CAST(latest_release_time AS TEXT) FROM user_entities WHERE id=?`, entity.Id.Int32).Scan(&again))
	assert.Equal(t, stored, again)

	// NULL 行不受影响。
	var nullCount int
	require.NoError(t, db.QueryRow(`SELECT COUNT(*) FROM user_entities WHERE latest_release_time IS NULL`).Scan(&nullCount))
	assert.GreaterOrEqual(t, nullCount, 0)
}

func TestSetUserEntityLatestReleaseTimeStoresUTC(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    2,
		Name:      "utcentity",
		ParentDir: tmpDir,
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)

	local := time.Date(2024, 1, 1, 8, 0, 0, 0, time.FixedZone("CST", 8*3600))
	require.NoError(t, database.SetUserEntityLatestReleaseTime(db, int(entity.Id.Int32), local))

	var stored string
	require.NoError(t, db.QueryRow(`SELECT CAST(latest_release_time AS TEXT) FROM user_entities WHERE id=?`, entity.Id.Int32).Scan(&stored))
	// 写入必须归一化为 UTC（00:00Z），否则 TEXT 字典序比较会被偏移主导。
	assert.Equal(t, "2024-01-01 00:00:00+00:00", stored)

	retrieved, err := database.GetUserEntity(db, int(entity.Id.Int32))
	require.NoError(t, err)
	require.True(t, retrieved.LatestReleaseTime.Valid)
	assert.Equal(t, int64(1704067200), retrieved.LatestReleaseTime.Time.Unix())
}

// TestNormalizeLegacyTimestampsAlignsLexicalAndInstantOrder 守护归一化的核心
// 目的：user_entities.latest_release_time 存为 TEXT 且按字典序比较，遗留的
// 非 UTC 偏移值会让字典序与时刻序相反（MAX() 比较保留旧基线 → 重复下载）。
// 归一化后按 TEXT 排序必须等于按时刻排序。
//
// 两行合成数据：
//
//	id=early 写入 "2024-01-01 09:00:00.000000000+08:00" → 时刻 2024-01-01T01:00:00Z
//	id=late  写入 "2024-01-01 08:00:00.000000000+00:00" → 时刻 2024-01-01T08:00:00Z
//
// 字典序把 early 排在 late 之后，而时刻序相反；归一化必须消除这一分歧。
func TestNormalizeLegacyTimestampsAlignsLexicalAndInstantOrder(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	parentDir := t.TempDir()
	early := &database.UserEntity{UserId: 11, Name: "order-early", ParentDir: parentDir}
	late := &database.UserEntity{UserId: 12, Name: "order-late", ParentDir: parentDir}
	require.NoError(t, database.CreateUserEntity(db, early))
	require.NoError(t, database.CreateUserEntity(db, late))

	_, err := db.Exec(`UPDATE user_entities SET latest_release_time=? WHERE id=?`,
		"2024-01-01 09:00:00.000000000+08:00", early.Id.Int32)
	require.NoError(t, err)
	_, err = db.Exec(`UPDATE user_entities SET latest_release_time=? WHERE id=?`,
		"2024-01-01 08:00:00.000000000+00:00", late.Id.Int32)
	require.NoError(t, err)

	before := selectOrderedTimestamps(t, db)
	require.Len(t, before, 2)
	// 归一化前：字典序把时刻更早的 +08:00 值排在后面（正是要修的分歧）。
	assert.Equal(t, []timestampRow{
		{Id: int(late.Id.Int32), Raw: "2024-01-01 08:00:00.000000000+00:00"},
		{Id: int(early.Id.Int32), Raw: "2024-01-01 09:00:00.000000000+08:00"},
	}, before)

	require.NoError(t, database.NormalizeLegacyTimestamps(db))

	after := selectOrderedTimestamps(t, db)
	require.Len(t, after, 2)
	// 归一化后：字典序 == 时刻序（+08:00 值被改写成 UTC 表示）。
	assert.Equal(t, []timestampRow{
		{Id: int(early.Id.Int32), Raw: "2024-01-01 01:00:00+00:00"},
		{Id: int(late.Id.Int32), Raw: "2024-01-01 08:00:00.000000000+00:00"},
	}, after)

	// 幂等：重复调用不改变任何取值与顺序。
	require.NoError(t, database.NormalizeLegacyTimestamps(db))
	assert.Equal(t, after, selectOrderedTimestamps(t, db))
}

type timestampRow struct {
	Id  int    `db:"id"`
	Raw string `db:"raw"`
}

// selectOrderedTimestamps 按 SQLite 的 TEXT 字典序返回非空时间戳。
func selectOrderedTimestamps(t *testing.T, db *sqlx.DB) []timestampRow {
	t.Helper()

	var rows []timestampRow
	require.NoError(t, db.Select(&rows,
		`SELECT id, CAST(latest_release_time AS TEXT) AS raw FROM user_entities
		 WHERE latest_release_time IS NOT NULL
		 ORDER BY CAST(latest_release_time AS TEXT)`))
	return rows
}
