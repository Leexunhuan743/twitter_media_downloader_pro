package api

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWeb2DefinesEntityMutationEndpoints(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("web", "web2", "app.js"))
	require.NoError(t, err)
	source := string(data)

	assert.Contains(t, source, "dbUserEntityUpdate:")
	assert.Contains(t, source, "dbListEntityUpdate:")
	assert.Contains(t, source, "dbUserLinkUpdate:")
}
