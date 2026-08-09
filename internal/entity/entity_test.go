package entity_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/entity"
)

type entityFixture struct {
	name         string
	newEntity    func(*sqlx.DB, string) (entity.Entity, error)
	seedParent   func(*sqlx.DB) error
	deleteRecord func(*sqlx.DB, int) error
}

var entityFixtures = []entityFixture{
	{
		name: "user",
		newEntity: func(db *sqlx.DB, parentDir string) (entity.Entity, error) {
			return entity.NewUserEntity(db, 101, parentDir)
		},
		seedParent: func(db *sqlx.DB) error {
			return database.CreateUser(db, &database.User{
				Id:           101,
				ScreenName:   "entity_test",
				Name:         "Entity Test",
				IsAccessible: true,
			})
		},
		deleteRecord: func(db *sqlx.DB, id int) error {
			return database.DelUserEntity(db, uint32(id))
		},
	},
	{
		name: "list",
		newEntity: func(db *sqlx.DB, parentDir string) (entity.Entity, error) {
			return entity.NewListEntity(db, 202, parentDir)
		},
		seedParent: func(db *sqlx.DB) error {
			return database.CreateLst(db, &database.Lst{Id: 202, Name: "Entity Test"})
		},
		deleteRecord: func(db *sqlx.DB, id int) error {
			return database.DelLstEntity(db, id)
		},
	},
}

func openEntityTestDB(t *testing.T) *sqlx.DB {
	t.Helper()
	db, err := database.Connect(filepath.Join(t.TempDir(), "entity.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func newFixtureEntity(t *testing.T, fixture entityFixture, db *sqlx.DB, parentDir string) entity.Entity {
	t.Helper()
	require.NoError(t, fixture.seedParent(db))
	result, err := fixture.newEntity(db, parentDir)
	require.NoError(t, err)
	return result
}

func TestConstructorsRejectNilDatabase(t *testing.T) {
	userEntity, userErr := entity.NewUserEntity(nil, 1, t.TempDir())
	assert.Nil(t, userEntity)
	assert.Error(t, userErr)

	listEntity, listErr := entity.NewListEntity(nil, 1, t.TempDir())
	assert.Nil(t, listEntity)
	assert.Error(t, listErr)
}

func TestSyncRejectsUnsafeEntityNames(t *testing.T) {
	unsafeNames := []string{"", ".", "..", "../escape", `child/name`, `child\name`}

	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			for _, name := range unsafeNames {
				t.Run(name, func(t *testing.T) {
					db := openEntityTestDB(t)
					root := t.TempDir()
					parentDir := filepath.Join(root, "entities")
					result := newFixtureEntity(t, fixture, db, parentDir)

					err := entity.Sync(result, name)

					assert.Error(t, err)
					assert.False(t, result.Recorded())
					assert.NoDirExists(t, filepath.Join(root, "escape"))
				})
			}
		})
	}
}

func TestCreateRollsBackDirectoryWhenDatabaseWriteFails(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, db.Close())

			err := result.Create("created")

			assert.Error(t, err)
			assert.False(t, result.Recorded())
			assert.NoDirExists(t, filepath.Join(parentDir, "created"))
			_, nameErr := result.Name()
			assert.Error(t, nameErr)
		})
	}
}

func TestCreatePreservesExistingDirectoryWhenDatabaseWriteFails(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			existingDir := filepath.Join(parentDir, "existing")
			require.NoError(t, os.Mkdir(existingDir, 0755))
			require.NoError(t, os.WriteFile(filepath.Join(existingDir, "marker.txt"), []byte("keep"), 0600))
			require.NoError(t, db.Close())

			err := result.Create("existing")

			assert.Error(t, err)
			assert.False(t, result.Recorded())
			assert.FileExists(t, filepath.Join(existingDir, "marker.txt"))
		})
	}
}

func TestRenameRollsBackDirectoryWhenDatabaseWriteFails(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, result.Create("old"))
			require.NoError(t, os.WriteFile(filepath.Join(parentDir, "old", "data.txt"), []byte("data"), 0600))
			require.NoError(t, db.Close())

			err := result.Rename("new")

			assert.Error(t, err)
			assert.DirExists(t, filepath.Join(parentDir, "old"))
			assert.FileExists(t, filepath.Join(parentDir, "old", "data.txt"))
			assert.NoDirExists(t, filepath.Join(parentDir, "new"))
			name, nameErr := result.Name()
			require.NoError(t, nameErr)
			assert.Equal(t, "old", name)
		})
	}
}

func TestRenameRejectsExistingDestination(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, result.Create("old"))
			require.NoError(t, os.Mkdir(filepath.Join(parentDir, "new"), 0755))
			require.NoError(t, os.WriteFile(filepath.Join(parentDir, "new", "marker.txt"), []byte("keep"), 0600))

			err := result.Rename("new")

			assert.Error(t, err)
			assert.DirExists(t, filepath.Join(parentDir, "old"))
			assert.FileExists(t, filepath.Join(parentDir, "new", "marker.txt"))
			name, nameErr := result.Name()
			require.NoError(t, nameErr)
			assert.Equal(t, "old", name)
		})
	}
}

func TestRenameRejectsExistingDestinationWhenSourceIsMissing(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, result.Create("old"))
			require.NoError(t, os.Remove(filepath.Join(parentDir, "old")))
			require.NoError(t, os.Mkdir(filepath.Join(parentDir, "new"), 0755))
			require.NoError(t, os.WriteFile(filepath.Join(parentDir, "new", "marker.txt"), []byte("keep"), 0600))

			err := result.Rename("new")

			assert.Error(t, err)
			assert.FileExists(t, filepath.Join(parentDir, "new", "marker.txt"))
			name, nameErr := result.Name()
			require.NoError(t, nameErr)
			assert.Equal(t, "old", name)
		})
	}
}

func TestRenameRollsBackWhenDatabaseRecordIsMissing(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, result.Create("old"))
			id, err := result.Id()
			require.NoError(t, err)
			require.NoError(t, fixture.deleteRecord(db, id))

			err = result.Rename("new")

			assert.Error(t, err)
			assert.DirExists(t, filepath.Join(parentDir, "old"))
			assert.NoDirExists(t, filepath.Join(parentDir, "new"))
			name, nameErr := result.Name()
			require.NoError(t, nameErr)
			assert.Equal(t, "old", name)
		})
	}
}

func TestRemoveRestoresDirectoryWhenDatabaseDeleteFails(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, result.Create("remove"))
			require.NoError(t, os.WriteFile(filepath.Join(parentDir, "remove", "data.txt"), []byte("data"), 0600))
			require.NoError(t, db.Close())

			err := result.Remove()

			assert.Error(t, err)
			assert.True(t, result.Recorded())
			assert.DirExists(t, filepath.Join(parentDir, "remove"))
			assert.FileExists(t, filepath.Join(parentDir, "remove", "data.txt"))
		})
	}
}

func TestRemoveRejectsUnrecordedEntity(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			result := newFixtureEntity(t, fixture, db, t.TempDir())

			assert.Error(t, result.Remove())
		})
	}
}
