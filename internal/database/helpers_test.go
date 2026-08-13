package database

import (
	"database/sql"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHandleGetResultWithContext_WithResult(t *testing.T) {
	type TestStruct struct {
		ID   int
		Name string
	}

	input := &TestStruct{ID: 1, Name: "test"}
	result, err := handleGetResultWithContext(input, nil, "get %s failed: %w", "row")

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, "test", result.Name)
}

func TestHandleGetResultWithContext_NoRows(t *testing.T) {
	type TestStruct struct {
		ID int
	}

	result, err := handleGetResultWithContext(&TestStruct{}, sql.ErrNoRows, "get failed: %w")

	assert.NoError(t, err)
	assert.Nil(t, result)
}

func TestHandleGetResultWithContext_OtherError(t *testing.T) {
	type TestStruct struct {
		ID int
	}

	testErr := errors.New("database connection failed")
	result, err := handleGetResultWithContext(&TestStruct{}, testErr, "get row failed: %w")

	assert.Error(t, err)
	assert.ErrorIs(t, err, testErr)
	assert.Contains(t, err.Error(), "get row failed")
	assert.Nil(t, result)
}

func TestHandleInsertWithId_Success(t *testing.T) {
	var capturedID int64
	scanner := func(id int64) {
		capturedID = id
	}

	mockResult := &mockSqlResult{lastID: 42}
	err := handleInsertWithId(mockResult, nil, scanner)

	assert.NoError(t, err)
	assert.Equal(t, int64(42), capturedID)
}

func TestHandleInsertWithId_InsertError(t *testing.T) {
	var capturedID int64
	scanner := func(id int64) {
		capturedID = id
	}

	testErr := errors.New("insert failed")
	err := handleInsertWithId(nil, testErr, scanner)

	assert.Error(t, err)
	assert.Equal(t, testErr, err)
	assert.Equal(t, int64(0), capturedID)
}

func TestHandleInsertWithId_LastIdError(t *testing.T) {
	var capturedID int64
	scanner := func(id int64) {
		capturedID = id
	}

	mockResult := &mockSqlResult{lastIDErr: errors.New("no last id")}
	err := handleInsertWithId(mockResult, nil, scanner)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no last id")
	assert.Equal(t, int64(0), capturedID)
}

type mockSqlResult struct {
	lastID       int64
	rowsAffected int64
	lastIDErr    error
	rowsErr      error
}

func (m *mockSqlResult) LastInsertId() (int64, error) {
	return m.lastID, m.lastIDErr
}

func (m *mockSqlResult) RowsAffected() (int64, error) {
	return m.rowsAffected, m.rowsErr
}
