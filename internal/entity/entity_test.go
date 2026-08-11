package entity_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

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
	setName      func(*sqlx.DB, int, string) error
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
		setName: func(db *sqlx.DB, id int, name string) error {
			_, err := db.Exec(`UPDATE user_entities SET name=? WHERE id=?`, name, id)
			return err
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
		setName: func(db *sqlx.DB, id int, name string) error {
			_, err := db.Exec(`UPDATE lst_entities SET name=? WHERE id=?`, name, id)
			return err
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
	unsafeNames := []string{
		"", ".", "..", "../escape", `child/name`, `child\name`, "windows.", "windows ",
		"windows:", "windows*", "windows?", `windows"`, "windows<", "windows>", "windows|",
		"CON", "con.txt", "PRN", "AUX.log", "NUL", "COM1", "com9.txt", "LPT1", "lpt9.log",
		".tmd-remove-reserved",
	}

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

// installWriteFailureTrigger 在实体表上安装 BEFORE INSERT/UPDATE/DELETE
// 触发器，使数据库写失败精确发生在最终写入（文件系统变更之后），
// 从而真实驱动 change.rollback / staged.rollback 分支。
func installWriteFailureTrigger(t *testing.T, db *sqlx.DB, event string) {
	t.Helper()
	for _, table := range []string{"user_entities", "lst_entities"} {
		_, err := db.Exec("CREATE TRIGGER test_fail_" + table + "_" + event +
			" BEFORE " + event + " ON " + table +
			" BEGIN SELECT RAISE(FAIL, 'injected write failure'); END")
		require.NoError(t, err)
	}
}

func TestCreateRollsBackDirectoryWhenDatabaseWriteFails(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			// 预检（LocateUserEntity，SELECT）不受触发器影响；失败点落在
			// ensureEntityDirectory 之后的 INSERT，真实驱动 change.rollback。
			installWriteFailureTrigger(t, db, "INSERT")

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
			installWriteFailureTrigger(t, db, "INSERT")

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
			// refreshRecord 是 SELECT 不受影响；失败点落在目录移动后的
			// name-only CAS（UPDATE），真实驱动 moved 回滚。
			installWriteFailureTrigger(t, db, "UPDATE")

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
			assert.ErrorIs(t, err, entity.ErrNotFound)
			assert.DirExists(t, filepath.Join(parentDir, "old"))
			assert.NoDirExists(t, filepath.Join(parentDir, "new"))
			name, nameErr := result.Name()
			require.NoError(t, nameErr)
			assert.Equal(t, "old", name)
		})
	}
}

func TestRenameRefreshesStaleEntityBeforeMovingDirectory(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			first := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, first.Create("old"))
			require.NoError(t, os.WriteFile(filepath.Join(parentDir, "old", "data.txt"), []byte("data"), 0600))

			stale, err := fixture.newEntity(db, parentDir)
			require.NoError(t, err)
			require.NoError(t, first.Rename("first"))

			require.NoError(t, stale.Rename("second"))

			assert.NoDirExists(t, filepath.Join(parentDir, "first"))
			assert.FileExists(t, filepath.Join(parentDir, "second", "data.txt"))
			name, nameErr := stale.Name()
			require.NoError(t, nameErr)
			assert.Equal(t, "second", name)
		})
	}
}

func TestSyncMigratesLegacyNamesWithTrailingWindowsCharacters(t *testing.T) {
	for _, fixture := range entityFixtures {
		for _, legacyName := range []string{"legacy.", "legacy "} {
			t.Run(fixture.name+"/"+legacyName, func(t *testing.T) {
				db := openEntityTestDB(t)
				parentDir := t.TempDir()
				result := newFixtureEntity(t, fixture, db, parentDir)
				require.NoError(t, result.Create("legacy-source"))
				id, err := result.Id()
				require.NoError(t, err)

				legacyPath := filepath.Join(parentDir, legacyName)
				addressablePath := legacyPath
				if runtime.GOOS == "windows" {
					addressablePath = filepath.Join(parentDir, strings.TrimRight(legacyName, " ."))
				}
				require.NoError(t, os.Rename(filepath.Join(parentDir, "legacy-source"), addressablePath))
				require.NoError(t, os.WriteFile(filepath.Join(addressablePath, "marker.txt"), []byte("keep"), 0600))
				require.NoError(t, fixture.setName(db, id, legacyName))

				stored, err := fixture.newEntity(db, parentDir)
				require.NoError(t, err)
				path, err := stored.Path()
				require.NoError(t, err)
				assert.Equal(t, addressablePath, path)

				require.NoError(t, entity.Sync(stored, "normalized"))

				assert.NoDirExists(t, addressablePath)
				assert.FileExists(t, filepath.Join(parentDir, "normalized", "marker.txt"))
				name, err := stored.Name()
				require.NoError(t, err)
				assert.Equal(t, "normalized", name)
			})
		}
	}
}

func TestRemoveHandlesLegacyStoredName(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, result.Create("legacy-source"))
			id, err := result.Id()
			require.NoError(t, err)

			legacyPath := filepath.Join(parentDir, "legacy.")
			addressablePath := legacyPath
			if runtime.GOOS == "windows" {
				addressablePath = filepath.Join(parentDir, "legacy")
			}
			require.NoError(t, os.Rename(filepath.Join(parentDir, "legacy-source"), addressablePath))
			require.NoError(t, fixture.setName(db, id, "legacy."))
			stored, err := fixture.newEntity(db, parentDir)
			require.NoError(t, err)

			require.NoError(t, stored.Remove())

			assert.False(t, stored.Recorded())
			assert.NoDirExists(t, addressablePath)
			journals, err := database.ListEntityRemovalJournals(db)
			require.NoError(t, err)
			assert.Empty(t, journals)
			reloaded, err := fixture.newEntity(db, parentDir)
			require.NoError(t, err)
			assert.False(t, reloaded.Recorded())
		})
	}
}

func TestRenameRejectsUnsafeStoredName(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			result := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, result.Create("safe-source"))
			id, err := result.Id()
			require.NoError(t, err)
			require.NoError(t, fixture.setName(db, id, "../escape"))

			err = result.Rename("normalized")

			assert.ErrorIs(t, err, entity.ErrInvalidName)
			assert.DirExists(t, filepath.Join(parentDir, "safe-source"))
			assert.NoDirExists(t, filepath.Join(parentDir, "normalized"))
			assert.NoDirExists(t, filepath.Join(filepath.Dir(parentDir), "escape"))
		})
	}
}

func TestUserRenamePreservesFreshStatistics(t *testing.T) {
	db := openEntityTestDB(t)
	parentDir := t.TempDir()
	result := newFixtureEntity(t, entityFixtures[0], db, parentDir)
	require.NoError(t, result.Create("old"))
	id, err := result.Id()
	require.NoError(t, err)
	releaseTime := time.Date(2026, time.August, 9, 12, 30, 0, 0, time.UTC)
	require.NoError(t, database.UpdateUserEntityTweetStat(db, id, releaseTime, 42))

	require.NoError(t, result.Rename("new"))

	record, err := database.GetUserEntity(db, id)
	require.NoError(t, err)
	require.NotNil(t, record)
	assert.True(t, record.LatestReleaseTime.Valid)
	assert.True(t, record.LatestReleaseTime.Time.Equal(releaseTime))
	assert.Equal(t, int32(42), record.MediaCount.Int32)
	assert.True(t, record.MediaCount.Valid)
}

func TestCreateRejectsDirectoryOwnedByAnotherEntity(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			first := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, first.Create("shared-name"))
			require.NoError(t, os.WriteFile(filepath.Join(parentDir, "shared-name", "media.jpg"), []byte("keep"), 0600))

			// 第二个实体（不同 owner）试图创建同名目录。
			var second entity.Entity
			if fixture.name == "user" {
				require.NoError(t, database.CreateUser(db, &database.User{Id: 202, ScreenName: "second", Name: "Second"}))
				second, _ = entity.NewUserEntity(db, 202, parentDir)
			} else {
				require.NoError(t, database.CreateLst(db, &database.Lst{Id: 203, Name: "Second List"}))
				second, _ = entity.NewListEntity(db, 203, parentDir)
			}

			err := second.Create("shared-name")

			assert.Error(t, err)
			// 第一实体的目录与内容不受影响。
			assert.FileExists(t, filepath.Join(parentDir, "shared-name", "media.jpg"))
			_, nameErr := second.Name()
			assert.Error(t, nameErr)
		})
	}
}

func TestCreateAllowsSameOwnerDirectoryReuse(t *testing.T) {
	db := openEntityTestDB(t)
	parentDir := t.TempDir()
	first := newFixtureEntity(t, entityFixtures[0], db, parentDir)
	require.NoError(t, first.Create("own-dir"))

	// 同 owner 同 parent 重复 Create（Locate 已存在 → 报 already exists，
	// 不被归属检查误伤；目录保留）。
	err := first.Create("own-dir")
	assert.Error(t, err)
	assert.DirExists(t, filepath.Join(parentDir, "own-dir"))
}

func TestRenameRejectsTargetOwnedByAnotherEntity(t *testing.T) {
	for _, fixture := range entityFixtures {
		t.Run(fixture.name, func(t *testing.T) {
			db := openEntityTestDB(t)
			parentDir := t.TempDir()
			first := newFixtureEntity(t, fixture, db, parentDir)
			require.NoError(t, first.Create("original"))
			require.NoError(t, os.WriteFile(filepath.Join(parentDir, "original", "data.txt"), []byte("keep"), 0600))

			// 第二个实体（不同 owner）记录占用目标名（目录缺失，模拟
			// 遗留归一化碰撞的磁盘态）。
			if fixture.name == "user" {
				require.NoError(t, database.CreateUser(db, &database.User{Id: 203, ScreenName: "third", Name: "Third"}))
				require.NoError(t, database.CreateUserEntity(db, &database.UserEntity{UserId: 203, Name: "target-name", ParentDir: parentDir}))
			} else {
				require.NoError(t, database.CreateLst(db, &database.Lst{Id: 204, Name: "Fourth List"}))
				require.NoError(t, database.CreateLstEntity(db, &database.LstEntity{LstId: 204, Name: "target-name", ParentDir: parentDir}))
			}

			// first 改名为被他人记录占用的目标名：必须被拒绝（目标目录
			// 缺失时 renameEntityDirectory 的 ErrPathConflict 不触发，靠
			// 归属检查拦截）。
			err := first.Rename("target-name")

			assert.Error(t, err)
			name, nameErr := first.Name()
			require.NoError(t, nameErr)
			assert.Equal(t, "original", name)
			assert.FileExists(t, filepath.Join(parentDir, "original", "data.txt"))
			assert.NoDirExists(t, filepath.Join(parentDir, "target-name"))
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
			// refreshRecord 是 SELECT 不受影响；失败点落在 stage（目录改名 +
			// journal 写入）之后的实体行 DELETE，真实驱动 staged.rollback
			// （恢复目录 + 删除 journal）。
			installWriteFailureTrigger(t, db, "DELETE")

			err := result.Remove()

			assert.Error(t, err)
			assert.True(t, result.Recorded())
			assert.DirExists(t, filepath.Join(parentDir, "remove"))
			assert.FileExists(t, filepath.Join(parentDir, "remove", "data.txt"))
			// rollback 必须同时清理 journal，否则启动清扫会重复处理。
			journals, listErr := database.ListEntityRemovalJournals(db)
			require.NoError(t, listErr)
			assert.Empty(t, journals)
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
