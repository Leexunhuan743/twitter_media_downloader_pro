package database_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
)

func setupUserEntityTestDB(t *testing.T) *sqlx.DB {
	db, err := sqlx.Connect(database.DriverName, database.MemoryDSN(true))
	require.NoError(t, err)
		require.NoError(t, database.CreateTables(db))

	usr := &database.User{
		Id:           1,
		ScreenName:   "testuser",
		Name:         "Test User",
		IsProtected:  false,
		FriendsCount: 100,
		IsAccessible: true,
	}
	err = database.CreateUser(db, usr)
	require.NoError(t, err)

	return db
}

func TestCreateUserEntity(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	t.Run("create_valid_entity", func(t *testing.T) {
		tmpDir := t.TempDir()
		entity := &database.UserEntity{
			UserId:    1,
			Name:      "testuser",
			ParentDir: tmpDir,
		}
		err := database.CreateUserEntity(db, entity)
		assert.NoError(t, err)
		assert.True(t, entity.Id.Valid)
		assert.Greater(t, entity.Id.Int32, int32(0))
	})

	t.Run("create_same_user_different_dir", func(t *testing.T) {
		// 使用相同Uid但不同ParentDir创建实体应该成功
		tmpDir := t.TempDir()
		entity := &database.UserEntity{
			UserId:    1,
			Name:      "testuser2",
			ParentDir: tmpDir,
		}
		err := database.CreateUserEntity(db, entity)
		assert.NoError(t, err)
	})

	t.Run("create_with_relative_path", func(t *testing.T) {
		entity := &database.UserEntity{
			UserId:    1,
			Name:      "reluser",
			ParentDir: ".",
		}
		err := database.CreateUserEntity(db, entity)
		assert.NoError(t, err)

		wd, _ := os.Getwd()
		assert.Equal(t, wd, entity.ParentDir)
	})

	t.Run("create_with_invalid_parent_dir", func(t *testing.T) {
		entity := &database.UserEntity{
			UserId:    1,
			Name:      "invalid",
			ParentDir: "\x00invalid",
		}
		err := database.CreateUserEntity(db, entity)
		assert.Error(t, err)
	})
}

func TestDelUserEntity(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	t.Run("delete_existing_entity", func(t *testing.T) {
		tmpDir := t.TempDir()
		entity := &database.UserEntity{
			UserId:    1,
			Name:      "todelete",
			ParentDir: tmpDir,
		}
		err := database.CreateUserEntity(db, entity)
		require.NoError(t, err)

		err = database.DelUserEntity(db, uint32(entity.Id.Int32))
		assert.NoError(t, err)

		retrieved, err := database.GetUserEntity(db, int(entity.Id.Int32))
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})

	t.Run("delete_nonexistent_entity", func(t *testing.T) {
		err := database.DelUserEntity(db, 99999)
		assert.ErrorIs(t, err, database.ErrEntityNotFound)
	})
}

func TestLocateUserEntity(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    1,
		Name:      "located",
		ParentDir: tmpDir,
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)

	t.Run("locate_existing_entity", func(t *testing.T) {
		retrieved, err := database.LocateUserEntity(db, 1, tmpDir)
		assert.NoError(t, err)
		assert.NotNil(t, retrieved)
		assert.Equal(t, "located", retrieved.Name)
	})

	t.Run("locate_nonexistent_entity", func(t *testing.T) {
		retrieved, err := database.LocateUserEntity(db, 99999, tmpDir)
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})

	t.Run("locate_with_different_parent_dir", func(t *testing.T) {
		retrieved, err := database.LocateUserEntity(db, 1, "/different/path")
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})

	t.Run("locate_with_relative_path", func(t *testing.T) {
		retrieved, err := database.LocateUserEntity(db, 1, ".")
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})
}

func TestGetUserEntity(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    1,
		Name:      "testentity",
		ParentDir: tmpDir,
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)
	entityId := int(entity.Id.Int32)

	t.Run("get_existing_entity", func(t *testing.T) {
		retrieved, err := database.GetUserEntity(db, entityId)
		assert.NoError(t, err)
		assert.NotNil(t, retrieved)
		assert.Equal(t, int32(entityId), retrieved.Id.Int32)
		assert.Equal(t, uint64(1), retrieved.UserId)
		assert.Equal(t, "testentity", retrieved.Name)
	})

	t.Run("get_nonexistent_entity", func(t *testing.T) {
		retrieved, err := database.GetUserEntity(db, 99999)
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})
}

func TestUpdateUserEntityNameIfCurrent(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()
	entity := &database.UserEntity{UserId: 1, Name: "original", ParentDir: t.TempDir()}
	require.NoError(t, database.CreateUserEntity(db, entity))

	updated, err := database.UpdateUserEntityNameIfCurrent(db, int(entity.Id.Int32), "original", "current")
	require.NoError(t, err)
	assert.True(t, updated)

	updated, err = database.UpdateUserEntityNameIfCurrent(db, int(entity.Id.Int32), "original", "stale")
	require.NoError(t, err)
	assert.False(t, updated)
	retrieved, err := database.GetUserEntity(db, int(entity.Id.Int32))
	require.NoError(t, err)
	assert.Equal(t, "current", retrieved.Name)
}

func TestUpdateUserEntityMetadata(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()
	entity := &database.UserEntity{UserId: 1, Name: "original", ParentDir: t.TempDir()}
	require.NoError(t, database.CreateUserEntity(db, entity))
	mediaCount := int32(42)
	releaseTime := sql.NullTime{Time: time.Date(2026, time.August, 9, 12, 0, 0, 0, time.UTC), Valid: true}

	require.NoError(t, database.UpdateUserEntityMetadata(db, int(entity.Id.Int32), &mediaCount, &releaseTime))
	retrieved, err := database.GetUserEntity(db, int(entity.Id.Int32))
	require.NoError(t, err)
	assert.Equal(t, "original", retrieved.Name)
	assert.Equal(t, mediaCount, retrieved.MediaCount.Int32)
	assert.True(t, retrieved.LatestReleaseTime.Time.Equal(releaseTime.Time))

	cleared := sql.NullTime{}
	require.NoError(t, database.UpdateUserEntityMetadata(db, int(entity.Id.Int32), nil, &cleared))
	retrieved, err = database.GetUserEntity(db, int(entity.Id.Int32))
	require.NoError(t, err)
	assert.Equal(t, mediaCount, retrieved.MediaCount.Int32)
	assert.False(t, retrieved.LatestReleaseTime.Valid)

	err = database.UpdateUserEntityMetadata(db, 99999, &mediaCount, nil)
	assert.ErrorIs(t, err, database.ErrEntityNotFound)
}

func TestUpdateUserEntityMediCount(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    1,
		Name:      "mediacount",
		ParentDir: tmpDir,
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)

	t.Run("update_media_count", func(t *testing.T) {
		err := database.UpdateUserEntityMediCount(db, int(entity.Id.Int32), 50)
		assert.NoError(t, err)

		retrieved, _ := database.GetUserEntity(db, int(entity.Id.Int32))
		assert.Equal(t, int32(50), retrieved.MediaCount.Int32)
	})

	t.Run("update_nonexistent_entity", func(t *testing.T) {
		err := database.UpdateUserEntityMediCount(db, 99999, 100)
		assert.NoError(t, err)
	})
}

func TestUpdateUserEntityTweetStat(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    1,
		Name:      "tweetstat",
		ParentDir: tmpDir,
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)

	t.Run("update_tweet_stat", func(t *testing.T) {
		now := time.Now()
		err := database.UpdateUserEntityTweetStat(db, int(entity.Id.Int32), now, 25)
		assert.NoError(t, err)

		retrieved, _ := database.GetUserEntity(db, int(entity.Id.Int32))
		assert.True(t, retrieved.LatestReleaseTime.Valid)
		assert.WithinDuration(t, now, retrieved.LatestReleaseTime.Time, time.Second)
		assert.Equal(t, int32(25), retrieved.MediaCount.Int32)
	})

	t.Run("update_tweet_stat_does_not_regress", func(t *testing.T) {
		newer := time.Now()
		older := newer.Add(-2 * time.Hour)
		require.NoError(t, database.UpdateUserEntityTweetStat(db, int(entity.Id.Int32), newer, 40))
		require.NoError(t, database.UpdateUserEntityTweetStat(db, int(entity.Id.Int32), older, 10))

		retrieved, _ := database.GetUserEntity(db, int(entity.Id.Int32))
		assert.True(t, retrieved.LatestReleaseTime.Valid)
		assert.WithinDuration(t, newer, retrieved.LatestReleaseTime.Time, time.Second)
		assert.Equal(t, int32(40), retrieved.MediaCount.Int32)
	})

	t.Run("update_nonexistent_entity", func(t *testing.T) {
		err := database.UpdateUserEntityTweetStat(db, 99999, time.Now(), 10)
		assert.NoError(t, err)
	})

	t.Run("mixed_zone_offsets_do_not_regress_baseline", func(t *testing.T) {
		// 存量数据可能以非 UTC 偏移存储（旧版本 mark 用本地时区写入）。
		// SQLite 按 TEXT 字典序比较，混合偏移会让 MAX 保留更旧基线。
		// 归一化到 UTC 后文本序等于时刻序，更新的时刻必须推进基线。
		_, err := db.Exec(`UPDATE user_entities SET latest_release_time=? WHERE id=?`,
			"2023-12-31 23:00:00.000000000+08:00", entity.Id.Int32)
		require.NoError(t, err)
		require.NoError(t, database.NormalizeLegacyTimestamps(db))

		// 该时刻的 UTC 表示 = 2023-12-31T15:00:00Z；更新 1 小时后（16:00Z）必须推进。
		baseline := time.Date(2023, 12, 31, 16, 0, 0, 0, time.UTC)
		require.NoError(t, database.UpdateUserEntityTweetStat(db, int(entity.Id.Int32), baseline, 60))

		retrieved, err := database.GetUserEntity(db, int(entity.Id.Int32))
		require.NoError(t, err)
		require.True(t, retrieved.LatestReleaseTime.Valid)
		// 归一化后存的是 UTC 文本；比较时刻而非墙钟。
		assert.Equal(t, int64(1704038400), retrieved.LatestReleaseTime.Time.Unix(),
			"baseline must advance to the newer instant (2023-12-31T16:00:00Z)")
		assert.Equal(t, int32(60), retrieved.MediaCount.Int32)
	})
}

func TestSetUserEntityLatestReleaseTime(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:    1,
		Name:      "releasetime",
		ParentDir: tmpDir,
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)

	t.Run("set_release_time", func(t *testing.T) {
		now := time.Now()
		err := database.SetUserEntityLatestReleaseTime(db, int(entity.Id.Int32), now)
		assert.NoError(t, err)

		retrieved, _ := database.GetUserEntity(db, int(entity.Id.Int32))
		assert.True(t, retrieved.LatestReleaseTime.Valid)
		assert.WithinDuration(t, now, retrieved.LatestReleaseTime.Time, time.Second)
	})

	t.Run("set_nonexistent_entity", func(t *testing.T) {
		err := database.SetUserEntityLatestReleaseTime(db, 99999, time.Now())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "no user entity found")
	})
}

func TestClearUserEntityLatestReleaseTime(t *testing.T) {
	db := setupUserEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.UserEntity{
		UserId:            1,
		Name:              "cleartime",
		ParentDir:         tmpDir,
		LatestReleaseTime: sql.NullTime{Time: time.Now(), Valid: true},
	}
	err := database.CreateUserEntity(db, entity)
	require.NoError(t, err)

	err = database.SetUserEntityLatestReleaseTime(db, int(entity.Id.Int32), time.Now())
	require.NoError(t, err)

	t.Run("clear_release_time", func(t *testing.T) {
		err := database.ClearUserEntityLatestReleaseTime(db, int(entity.Id.Int32))
		assert.NoError(t, err)

		retrieved, _ := database.GetUserEntity(db, int(entity.Id.Int32))
		assert.False(t, retrieved.LatestReleaseTime.Valid)
	})

	t.Run("clear_nonexistent_entity", func(t *testing.T) {
		err := database.ClearUserEntityLatestReleaseTime(db, 99999)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "no user entity found")
	})
}

func TestUserEntity_PathMethod(t *testing.T) {
	tmpDir := t.TempDir()

	t.Run("valid_path", func(t *testing.T) {
		entity := &database.UserEntity{
			Name:      "testuser",
			ParentDir: tmpDir,
		}
		path, err := entity.Path()
		assert.NoError(t, err)
		assert.Equal(t, filepath.Join(tmpDir, "testuser"), path)
	})

	t.Run("empty_parent_dir", func(t *testing.T) {
		entity := &database.UserEntity{
			Name:      "testuser",
			ParentDir: "",
		}
		path, err := entity.Path()
		assert.Error(t, err)
		assert.Empty(t, path)
	})

	t.Run("empty_name", func(t *testing.T) {
		entity := &database.UserEntity{
			Name:      "",
			ParentDir: tmpDir,
		}
		path, err := entity.Path()
		assert.Error(t, err)
		assert.Empty(t, path)
	})
}
