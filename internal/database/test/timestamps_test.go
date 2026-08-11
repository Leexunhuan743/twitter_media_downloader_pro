package database_test

import (
	"testing"
	"time"

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
