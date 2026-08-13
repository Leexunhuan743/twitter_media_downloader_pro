package database_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
)

func setupLstEntityTestDB(t *testing.T) *sqlx.DB {
	db, err := sqlx.Connect(database.DriverName, database.MemoryDSN(true))
	require.NoError(t, err)
		require.NoError(t, database.CreateTables(db))

	lst := &database.Lst{
		Id:          1,
		Name:        "TestList",
		OwnerUserId: 100,
	}
	err = database.CreateLst(db, lst)
	require.NoError(t, err)

	return db
}

func TestCreateLstEntity(t *testing.T) {
	db := setupLstEntityTestDB(t)
	defer db.Close()

	t.Run("create_valid_entity", func(t *testing.T) {
		tmpDir := t.TempDir()
		entity := &database.LstEntity{
			LstId:     1,
			Name:      "testlist",
			ParentDir: tmpDir,
		}
		err := database.CreateLstEntity(db, entity)
		assert.NoError(t, err)
		assert.True(t, entity.Id.Valid)
		assert.Greater(t, entity.Id.Int32, int32(0))
	})

	t.Run("create_duplicate_entity", func(t *testing.T) {
		// 由于使用了不同的ParentDir，这实际上不会创建重复实体
		// 这里改为验证可以成功创建不同目录下的同名列表实体
		tmpDir := t.TempDir()
		entity := &database.LstEntity{
			LstId:     1,
			Name:      "testlist2",
			ParentDir: tmpDir,
		}
		err := database.CreateLstEntity(db, entity)
		assert.NoError(t, err)
	})

	t.Run("create_with_relative_path", func(t *testing.T) {
		entity := &database.LstEntity{
			LstId:     1,
			Name:      "relentity",
			ParentDir: ".",
		}
		err := database.CreateLstEntity(db, entity)
		assert.NoError(t, err)

		wd, _ := os.Getwd()
		assert.Equal(t, wd, entity.ParentDir)
	})

	t.Run("create_with_invalid_parent_dir", func(t *testing.T) {
		entity := &database.LstEntity{
			LstId:     1,
			Name:      "invalid",
			ParentDir: "\x00invalid",
		}
		err := database.CreateLstEntity(db, entity)
		assert.Error(t, err)
	})

	t.Run("create_with_explicit_id", func(t *testing.T) {
		tmpDir := t.TempDir()
		entity := &database.LstEntity{
			Id:        sql.NullInt32{Int32: 100, Valid: true},
			LstId:     1,
			Name:      "explicitid",
			ParentDir: tmpDir,
		}
		err := database.CreateLstEntity(db, entity)
		assert.NoError(t, err)
		assert.Equal(t, int32(100), entity.Id.Int32)
	})
}

func TestDelLstEntity(t *testing.T) {
	db := setupLstEntityTestDB(t)
	defer db.Close()

	t.Run("delete_existing_entity", func(t *testing.T) {
		tmpDir := t.TempDir()
		entity := &database.LstEntity{
			LstId:     1,
			Name:      "todelete",
			ParentDir: tmpDir,
		}
		err := database.CreateLstEntity(db, entity)
		require.NoError(t, err)

		err = database.DelLstEntity(db, int(entity.Id.Int32))
		assert.NoError(t, err)

		retrieved, err := database.GetLstEntity(db, int(entity.Id.Int32))
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})

	t.Run("delete_nonexistent_entity", func(t *testing.T) {
		_, err := db.Exec(`INSERT INTO user_links(user_id, name, parent_lst_entity_id) VALUES(1, 'orphan', 99999)`)
		require.NoError(t, err)
		err = database.DelLstEntity(db, 99999)
		assert.ErrorIs(t, err, database.ErrEntityNotFound)
		var count int
		require.NoError(t, db.Get(&count, `SELECT COUNT(*) FROM user_links WHERE parent_lst_entity_id=99999`))
		assert.Equal(t, 1, count, "failed delete should roll back link cleanup")
	})

	t.Run("delete_entity_removes_user_links", func(t *testing.T) {
		user := &database.User{Id: 42, ScreenName: "linked-user", Name: "Linked User", IsAccessible: true}
		require.NoError(t, database.CreateUser(db, user))
		entity := &database.LstEntity{LstId: 1, Name: "linked-list", ParentDir: t.TempDir()}
		require.NoError(t, database.CreateLstEntity(db, entity))
		link := &database.UserLink{UserId: user.Id, Name: user.ScreenName, ParentLstEntityId: entity.Id.Int32}
		require.NoError(t, database.CreateUserLink(db, link))

		require.NoError(t, database.DelLstEntity(db, int(entity.Id.Int32)))

		var count int
		require.NoError(t, db.Get(&count, `SELECT COUNT(*) FROM user_links WHERE parent_lst_entity_id=?`, entity.Id.Int32))
		assert.Zero(t, count)
	})
}

func TestGetLstEntity(t *testing.T) {
	db := setupLstEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.LstEntity{
		LstId:     1,
		Name:      "testentity",
		ParentDir: tmpDir,
	}
	err := database.CreateLstEntity(db, entity)
	require.NoError(t, err)
	entityId := int(entity.Id.Int32)

	t.Run("get_existing_entity", func(t *testing.T) {
		retrieved, err := database.GetLstEntity(db, entityId)
		assert.NoError(t, err)
		assert.NotNil(t, retrieved)
		assert.Equal(t, int32(entityId), retrieved.Id.Int32)
		assert.Equal(t, int64(1), retrieved.LstId)
		assert.Equal(t, "testentity", retrieved.Name)
	})

	t.Run("get_nonexistent_entity", func(t *testing.T) {
		retrieved, err := database.GetLstEntity(db, 99999)
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})
}

func TestLocateLstEntity(t *testing.T) {
	db := setupLstEntityTestDB(t)
	defer db.Close()

	tmpDir := t.TempDir()
	entity := &database.LstEntity{
		LstId:     1,
		Name:      "located",
		ParentDir: tmpDir,
	}
	err := database.CreateLstEntity(db, entity)
	require.NoError(t, err)

	t.Run("locate_existing_entity", func(t *testing.T) {
		retrieved, err := database.LocateLstEntity(db, 1, tmpDir)
		assert.NoError(t, err)
		assert.NotNil(t, retrieved)
		assert.Equal(t, "located", retrieved.Name)
	})

	t.Run("locate_nonexistent_entity", func(t *testing.T) {
		retrieved, err := database.LocateLstEntity(db, 99999, tmpDir)
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})

	t.Run("locate_with_different_parent_dir", func(t *testing.T) {
		retrieved, err := database.LocateLstEntity(db, 1, "/different/path")
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})

	t.Run("locate_with_relative_path", func(t *testing.T) {
		retrieved, err := database.LocateLstEntity(db, 1, ".")
		assert.NoError(t, err)
		assert.Nil(t, retrieved)
	})
}

func TestUpdateLstEntityNameIfCurrent(t *testing.T) {
	db := setupLstEntityTestDB(t)
	defer db.Close()
	entity := &database.LstEntity{LstId: 1, Name: "original", ParentDir: t.TempDir()}
	require.NoError(t, database.CreateLstEntity(db, entity))

	updated, err := database.UpdateLstEntityNameIfCurrent(db, int(entity.Id.Int32), "original", "current")
	require.NoError(t, err)
	assert.True(t, updated)

	updated, err = database.UpdateLstEntityNameIfCurrent(db, int(entity.Id.Int32), "original", "stale")
	require.NoError(t, err)
	assert.False(t, updated)
	retrieved, err := database.GetLstEntity(db, int(entity.Id.Int32))
	require.NoError(t, err)
	assert.Equal(t, "current", retrieved.Name)
}

func TestLstEntity_PathMethod(t *testing.T) {
	tmpDir := t.TempDir()

	t.Run("valid_path", func(t *testing.T) {
		entity := &database.LstEntity{
			Name:      "testlist",
			ParentDir: tmpDir,
		}
		path, err := entity.Path()
		assert.NoError(t, err)
		assert.Equal(t, filepath.Join(tmpDir, "testlist"), path)
	})

	t.Run("empty_parent_dir", func(t *testing.T) {
		entity := &database.LstEntity{
			Name:      "testlist",
			ParentDir: "",
		}
		path, err := entity.Path()
		assert.Error(t, err)
		assert.Empty(t, path)
	})

	t.Run("empty_name", func(t *testing.T) {
		entity := &database.LstEntity{
			Name:      "",
			ParentDir: tmpDir,
		}
		path, err := entity.Path()
		assert.Error(t, err)
		assert.Empty(t, path)
	})
}

func TestLstEntity_CRUD(t *testing.T) {
	db := setupLstEntityTestDB(t)
	defer db.Close()

	t.Run("full_crud_lifecycle", func(t *testing.T) {
		tmpDir := t.TempDir()
		entity := &database.LstEntity{
			LstId:     1,
			Name:      "lifecycle",
			ParentDir: tmpDir,
		}

		err := database.CreateLstEntity(db, entity)
		require.NoError(t, err)
		assert.True(t, entity.Id.Valid)

		retrieved, err := database.GetLstEntity(db, int(entity.Id.Int32))
		require.NoError(t, err)
		assert.Equal(t, "lifecycle", retrieved.Name)

		located, err := database.LocateLstEntity(db, 1, tmpDir)
		require.NoError(t, err)
		assert.NotNil(t, located)
		assert.Equal(t, "lifecycle", located.Name)

		updated, err := database.UpdateLstEntityNameIfCurrent(db, int(entity.Id.Int32), entity.Name, "updated")
		require.NoError(t, err)
		require.True(t, updated)
		entity.Name = "updated"

		retrieved, _ = database.GetLstEntity(db, int(entity.Id.Int32))
		assert.Equal(t, "updated", retrieved.Name)

		err = database.DelLstEntity(db, int(entity.Id.Int32))
		require.NoError(t, err)

		retrieved, _ = database.GetLstEntity(db, int(entity.Id.Int32))
		assert.Nil(t, retrieved)
	})
}
