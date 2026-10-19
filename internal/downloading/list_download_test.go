package downloading

import (
	"context"
	"os"
	"testing"

	"github.com/go-resty/resty/v2"
	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/twitter"
)

// MockList implements twitter.ListBase for testing
type MockList struct {
	id      int64
	name    string
	members []*twitter.User
	err     error
}

func (m *MockList) GetId() int64 {
	return m.id
}

func (m *MockList) Title() string {
	return m.name
}

func (m *MockList) GetMembers(ctx context.Context, client *resty.Client) (*twitter.MembersResult, error) {
	if m.err != nil {
		return nil, m.err
	}
	return &twitter.MembersResult{Users: m.members}, nil
}

func TestSyncList(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	list := &twitter.List{
		Id:   12345,
		Name: "Test List",
		Creator: &twitter.User{
			Id: 999,
		},
	}

	// Test creating a new list
	err := syncList(db, list)
	if err != nil {
		t.Errorf("syncList() error = %v", err)
	}

	// Verify list was created
	lst, err := database.GetLst(db, list.Id)
	if err != nil {
		t.Fatalf("Failed to get list: %v", err)
	}

	if lst == nil {
		t.Fatal("List should exist after sync")
	}

	if lst.Name != list.Name {
		t.Errorf("Name = %s, want %s", lst.Name, list.Name)
	}

	// Test updating the same list
	list.Name = "Updated List"
	err = syncList(db, list)
	if err != nil {
		t.Errorf("syncList() update error = %v", err)
	}

	lst, err = database.GetLst(db, list.Id)
	if err != nil {
		t.Fatalf("Failed to get list after update: %v", err)
	}

	if lst.Name != "Updated List" {
		t.Errorf("Name after update = %s, want Updated List", lst.Name)
	}
}

func TestSyncListAndGetMembers(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	tempDir := t.TempDir()
	ctx := context.Background()

	members := []*twitter.User{
		{Id: 1, Name: "User 1", ScreenName: "user1"},
		{Id: 2, Name: "User 2", ScreenName: "user2"},
	}

	mockList := &MockList{
		id:      12345,
		name:    "Test List",
		members: members,
	}

	// Test syncing list and getting members
	entities, users, err := syncListAndGetMembers(ctx, nil, db, mockList, tempDir, 158, nil)
	if err != nil {
		t.Fatalf("syncListAndGetMembers() error = %v", err)
	}

	if len(users) != 2 {
		t.Errorf("len(users) = %d, want 2", len(users))
	}

	// Verify list entity was created by locating it
	le, err := database.LocateLstEntity(db, mockList.id, tempDir)
	if err != nil {
		t.Fatalf("Failed to locate list entity: %v", err)
	}

	if le == nil {
		t.Error("List entity should be created")
	}

	// Verify entities have correct leid
	for _, e := range entities {
		if e.leid == 0 {
			t.Error("entity.leid should not be 0")
			continue
		}
	}
}

func TestSyncListAndGetMembers_EmptyMembers(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	tempDir := t.TempDir()
	ctx := context.Background()

	mockList := &MockList{
		id:      12345,
		name:    "Empty List",
		members: []*twitter.User{},
	}

	_, users, err := syncListAndGetMembers(ctx, nil, db, mockList, tempDir, 158, nil)
	if err != nil {
		t.Fatalf("syncListAndGetMembers() error = %v", err)
	}

	if len(users) != 0 {
		t.Errorf("len(users) = %d, want 0", len(users))
	}
}

func TestSyncListAndGetMembers_GetMembersError(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	tempDir := t.TempDir()
	ctx := context.Background()

	mockList := &MockList{
		id:   12345,
		name: "Error List",
		err:  context.DeadlineExceeded,
	}

	_, _, err := syncListAndGetMembers(ctx, nil, db, mockList, tempDir, 158, nil)
	if err == nil {
		t.Error("syncListAndGetMembers() should return error when GetMembers fails")
	}
}
func TestSyncListAndGetMembers_DirectoryCreation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	tempDir := t.TempDir()
	ctx := context.Background()

	members := []*twitter.User{
		{Id: 1, Name: "User 1", ScreenName: "user1"},
	}

	mockList := &MockList{
		id:      12345,
		name:    "Test List With Spaces",
		members: members,
	}

	_, _, err := syncListAndGetMembers(ctx, nil, db, mockList, tempDir, 158, nil)
	if err != nil {
		t.Fatalf("syncListAndGetMembers() error = %v", err)
	}

	// Verify directory was created by locating the entity
	le, err := database.LocateLstEntity(db, mockList.id, tempDir)
	if err != nil {
		t.Fatalf("Failed to locate list entity: %v", err)
	}

	if le != nil {
		path, err := le.Path()
		if err != nil {
			t.Errorf("Path() error = %v", err)
		} else if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("Directory %s should exist", path)
		}
	}
}
