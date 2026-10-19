package database_test

import (
	"database/sql"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
)

func setupTestDB(t *testing.T) *sqlx.DB {
	db, err := sqlx.Connect(database.DriverName, database.MemoryDSN(true))
	require.NoError(t, err)
	require.NoError(t, database.CreateTables(db))
	return db
}
func TestUserLink_Path(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	t.Run("valid_path", func(t *testing.T) {
		lst := &database.Lst{Id: 1, Name: "TestList", OwnerUserId: 100}
		err := database.CreateLst(db, lst)
		require.NoError(t, err)

		le := &database.LstEntity{
			LstId:     1,
			Name:      "list_entity",
			ParentDir: "/tmp/lists",
		}
		err = database.CreateLstEntity(db, le)
		require.NoError(t, err)

		ul := &database.UserLink{
			UserId:            200,
			Name:              "user_link",
			ParentLstEntityId: database.NullInt32(le.Id),
		}

		path, err := ul.Path(db)
		assert.NoError(t, err)
		assert.Contains(t, path, "list_entity")
		assert.Contains(t, path, "user_link")
	})

	t.Run("parent_not_exists", func(t *testing.T) {
		ul := &database.UserLink{
			UserId:            200,
			Name:              "user_link",
			ParentLstEntityId: 99999,
		}

		path, err := ul.Path(db)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "parent lst was not exists")
		assert.Empty(t, path)
	})

	t.Run("db_error", func(t *testing.T) {
		db.Close()

		ul := &database.UserLink{
			UserId:            200,
			Name:              "user_link",
			ParentLstEntityId: 1,
		}

		path, err := ul.Path(db)
		assert.Error(t, err)
		assert.Empty(t, path)
	})
}

func TestNullInt32(t *testing.T) {
	t.Run("valid_value", func(t *testing.T) {
		n := sql.NullInt32{
			Int32: 42,
			Valid: true,
		}
		assert.Equal(t, int32(42), database.NullInt32(n))
	})

	t.Run("null_value", func(t *testing.T) {
		n := sql.NullInt32{
			Int32: 42,
			Valid: false,
		}
		assert.Equal(t, int32(0), database.NullInt32(n))
	})
}
func TestUserEntity_Path_AbsoluteConversion(t *testing.T) {
	ue := &database.UserEntity{
		Name:      "testuser",
		ParentDir: ".",
	}

	path, err := ue.Path()
	assert.NoError(t, err)

	// 在Windows上路径格式可能不同，所以只检查是否包含文件名
	assert.Contains(t, path, "testuser")
	assert.NotEqual(t, ".", path)
}
