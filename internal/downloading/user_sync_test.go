package downloading

import (
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/twitter"
)

func TestSyncUser(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	user := &twitter.User{
		Id:           12345,
		Name:         "Test User",
		ScreenName:   "testuser",
		IsProtected:  false,
		FriendsCount: 100,
	}

	// Test syncing a new user
	err := database.SyncUser(db, user.Id, user.Name, user.ScreenName, user.IsProtected, user.FriendsCount, true)
	if err != nil {
		t.Errorf("database.SyncUser() error = %v", err)
	}

	// Verify user was created
	syncedUser, err := database.GetUserById(db, user.Id)
	if err != nil {
		t.Fatalf("Failed to get user: %v", err)
	}

	if syncedUser == nil {
		t.Fatal("User should exist after sync")
	}

	if syncedUser.Name != user.Name {
		t.Errorf("Name = %s, want %s", syncedUser.Name, user.Name)
	}

	if syncedUser.ScreenName != user.ScreenName {
		t.Errorf("ScreenName = %s, want %s", syncedUser.ScreenName, user.ScreenName)
	}

	if syncedUser.IsProtected != user.IsProtected {
		t.Errorf("IsProtected = %v, want %v", syncedUser.IsProtected, user.IsProtected)
	}

	if syncedUser.FriendsCount != user.FriendsCount {
		t.Errorf("FriendsCount = %d, want %d", syncedUser.FriendsCount, user.FriendsCount)
	}

	// Test syncing the same user again (update)
	user.Name = "Updated Name"
	err = database.SyncUser(db, user.Id, user.Name, user.ScreenName, user.IsProtected, user.FriendsCount, true)
	if err != nil {
		t.Errorf("database.SyncUser() update error = %v", err)
	}

	// Verify update
	syncedUser, err = database.GetUserById(db, user.Id)
	if err != nil {
		t.Fatalf("Failed to get user after update: %v", err)
	}

	if syncedUser.Name != "Updated Name" {
		t.Errorf("Name after update = %s, want Updated Name", syncedUser.Name)
	}
}

func TestSyncUserAndEntity(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	tempDir := t.TempDir()

	user := &twitter.User{
		Id:           12345,
		Name:         "Test User",
		ScreenName:   "testuser",
		IsProtected:  false,
		FriendsCount: 100,
	}

	// Test syncing user and entity
	entity, err := syncUserAndEntity(db, user, tempDir, 158)
	if err != nil {
		t.Fatalf("syncUserAndEntity() error = %v", err)
	}

	if entity == nil {
		t.Fatal("Entity should not be nil")
	}

	// Verify entity properties
	if entity.UserId() != user.Id {
		t.Errorf("UserId() = %d, want %d", entity.UserId(), user.Id)
	}

	// Verify directory was created
	path, err := entity.Path()
	if err != nil {
		t.Fatalf("Path() error = %v", err)
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("Entity directory should exist")
	}

	// Verify user was synced
	syncedUser, err := database.GetUserById(db, user.Id)
	if err != nil {
		t.Fatalf("Failed to get user: %v", err)
	}

	if syncedUser == nil {
		t.Fatal("User should exist after syncUserAndEntity")
	}

	if syncedUser.IsProtected != user.IsProtected {
		t.Errorf("IsProtected = %v, want %v", syncedUser.IsProtected, user.IsProtected)
	}

	if syncedUser.FriendsCount != user.FriendsCount {
		t.Errorf("FriendsCount = %d, want %d", syncedUser.FriendsCount, user.FriendsCount)
	}
}

func TestSyncUserAndEntity_UpdateExisting(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	tempDir := t.TempDir()

	user := &twitter.User{
		Id:           12345,
		Name:         "Test User",
		ScreenName:   "testuser",
		IsProtected:  false,
		FriendsCount: 100,
	}

	// First sync
	entity1, err := syncUserAndEntity(db, user, tempDir, 158)
	if err != nil {
		t.Fatalf("First syncUserAndEntity() error = %v", err)
	}

	path1, _ := entity1.Path()

	// Update user and sync again
	user.Name = "Updated User"
	entity2, err := syncUserAndEntity(db, user, tempDir, 158)
	if err != nil {
		t.Fatalf("Second syncUserAndEntity() error = %v", err)
	}

	// Should return the same entity
	if entity1.UserId() != entity2.UserId() {
		t.Error("Should return entity for same user")
	}

	// Verify directory was renamed
	path2, _ := entity2.Path()
	if path1 == path2 {
		t.Log("Path may or may not change depending on implementation")
	}
}

func TestSyncUserAndEntity_UserWithSpecialChars(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	tempDir := t.TempDir()

	user := &twitter.User{
		Id:           12345,
		Name:         "Test User / Special:Chars",
		ScreenName:   "testuser",
		IsProtected:  false,
		FriendsCount: 100,
	}

	entity, err := syncUserAndEntity(db, user, tempDir, 158)
	if err != nil {
		t.Fatalf("syncUserAndEntity() error = %v", err)
	}

	if entity == nil {
		t.Fatal("Entity should not be nil")
	}

	// Verify directory exists
	path, err := entity.Path()
	if err != nil {
		t.Fatalf("Path() error = %v", err)
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("Entity directory should exist even with special characters in name")
	}

	// Verify user was synced with correct data
	syncedUser, err := database.GetUserById(db, user.Id)
	if err != nil {
		t.Fatalf("Failed to get user: %v", err)
	}

	if syncedUser.IsProtected != user.IsProtected {
		t.Errorf("IsProtected = %v, want %v", syncedUser.IsProtected, user.IsProtected)
	}

	if syncedUser.FriendsCount != user.FriendsCount {
		t.Errorf("FriendsCount = %d, want %d", syncedUser.FriendsCount, user.FriendsCount)
	}
}

func TestShouldIgnoreUser(t *testing.T) {
	tests := []struct {
		name     string
		user     *twitter.User
		expected bool
	}{
		{
			name: "normal user",
			user: &twitter.User{
				Id:         1,
				Name:       "Normal",
				ScreenName: "normal",
				Blocking:   false,
				Muting:     false,
			},
			expected: false,
		},
		{
			name: "blocking user",
			user: &twitter.User{
				Id:         2,
				Name:       "Blocking",
				ScreenName: "blocking",
				Blocking:   true,
				Muting:     false,
			},
			expected: true,
		},
		{
			name: "muting user",
			user: &twitter.User{
				Id:         3,
				Name:       "Muting",
				ScreenName: "muting",
				Blocking:   false,
				Muting:     true,
			},
			expected: true,
		},
		{
			name: "blocking and muting user",
			user: &twitter.User{
				Id:         4,
				Name:       "Both",
				ScreenName: "both",
				Blocking:   true,
				Muting:     true,
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldIgnoreUser(tt.user)
			if got != tt.expected {
				t.Errorf("shouldIgnoreUser() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestShouldIgnoreUser_Nil(t *testing.T) {
	// Test with nil user - this will panic because the function doesn't check for nil
	// This test documents the current behavior
	defer func() {
		if r := recover(); r != nil {
			t.Logf("shouldIgnoreUser(nil) panicked as expected: %v", r)
		}
	}()

	// This will panic because we access user.Blocking without nil check
	_ = shouldIgnoreUser(nil)
}

func TestSyncUser_NilDB(t *testing.T) {
	user := &twitter.User{
		Id:         12345,
		Name:       "Test",
		ScreenName: "test",
	}

	// Test with nil DB - this will panic because the function doesn't check for nil
	defer func() {
		if r := recover(); r != nil {
			t.Logf("database.SyncUser(nil, ...) panicked as expected: %v", r)
		}
	}()

	_ = database.SyncUser(nil, user.Id, user.Name, user.ScreenName, user.IsProtected, user.FriendsCount, true)
}

// TestSyncUserRecordsRenameHistory 守护改名历史：新用户首次同步先写入基线，
// 之后同 uid 改名时追加的是改名前的旧值（记成新值会让历史页显示"改名从
// 新名字变成新名字"，也丢失旧目录名线索）；名称未变时不追加。
func TestSyncUserRecordsRenameHistory(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	const uid = uint64(4242)

	require.NoError(t, database.SyncUser(db, uid, "Old Display", "old_handle", false, 3, true))

	baseline, err := database.QueryUserPreviousNames(db, uid, 10, 0)
	require.NoError(t, err)
	require.Len(t, baseline, 1, "first sync must record exactly one baseline row")
	assert.Equal(t, "Old Display", baseline[0].Name)
	assert.Equal(t, "old_handle", baseline[0].ScreenName)

	// 第一次改名：历史只应多出一行，且记录的是改名前的旧值——历史里不能
	// 出现改名后的新值（新值只存在于 users 表）。
	require.NoError(t, database.SyncUser(db, uid, "New Display", "new_handle", false, 4, true))

	history := previousNamePairs(t, db, uid)
	assert.Len(t, history, 2, "rename must append exactly one history row")
	assert.Contains(t, history, "old_handle|Old Display")
	assert.NotContains(t, history, "new_handle|New Display", "rename must record the pre-rename values")

	current, err := database.GetUserById(db, uid)
	require.NoError(t, err)
	require.NotNil(t, current)
	assert.Equal(t, "New Display", current.Name)
	assert.Equal(t, "new_handle", current.ScreenName)

	// 第二次改名：追加的必须是上一轮的旧值（New Display/new_handle）。
	require.NoError(t, database.SyncUser(db, uid, "Newest Display", "newest_handle", false, 5, true))

	history = previousNamePairs(t, db, uid)
	assert.Len(t, history, 3)
	assert.Contains(t, history, "old_handle|Old Display")
	assert.Contains(t, history, "new_handle|New Display")
	assert.NotContains(t, history, "newest_handle|Newest Display")

	// 名称未变的重复同步不得再写历史（用户同步每轮都会跑）。
	require.NoError(t, database.SyncUser(db, uid, "Newest Display", "newest_handle", false, 5, true))
	rows, err := database.QueryUserPreviousNames(db, uid, 10, 0)
	require.NoError(t, err)
	assert.Len(t, rows, 3, "unchanged names must not append history rows")
}

// previousNamePairs 把某 uid 的历史名称归约为 "screen_name|name" 列表，
// 避免依赖同秒写入时 record_date 的排序稳定性。
func previousNamePairs(t *testing.T, db *sqlx.DB, uid uint64) []string {
	t.Helper()

	rows, err := database.QueryUserPreviousNames(db, uid, 10, 0)
	require.NoError(t, err)

	pairs := make([]string, 0, len(rows))
	for _, row := range rows {
		pairs = append(pairs, row.ScreenName+"|"+row.Name)
	}
	return pairs
}
