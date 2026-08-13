package database_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/unkmonster/tmd/internal/database"
)

func TestEntityRemovalJournalLifecycle(t *testing.T) {
	db := setupSchemaTestDB(t)
	t.Cleanup(func() { require.NoError(t, db.Close()) })
		require.NoError(t, database.CreateTables(db))
	journal := database.EntityRemovalJournal{
		StagedPath:   `/data/.tmd-remove-v1-stage`,
		OriginalPath: `/data/entity`,
	}

	require.NoError(t, database.CreateEntityRemovalJournal(db, journal))
	journals, err := database.ListEntityRemovalJournals(db)
	require.NoError(t, err)
	assert.Equal(t, []database.EntityRemovalJournal{journal}, journals)

	require.NoError(t, database.DeleteEntityRemovalJournal(db, journal.StagedPath))
	require.NoError(t, database.DeleteEntityRemovalJournal(db, journal.StagedPath))
	journals, err = database.ListEntityRemovalJournals(db)
	require.NoError(t, err)
	assert.Empty(t, journals)
}

func TestEntityRemovalJournalRejectsEmptyPaths(t *testing.T) {
	db := setupSchemaTestDB(t)
	t.Cleanup(func() { require.NoError(t, db.Close()) })
		require.NoError(t, database.CreateTables(db))

	err := database.CreateEntityRemovalJournal(db, database.EntityRemovalJournal{})

	assert.Error(t, err)
}
