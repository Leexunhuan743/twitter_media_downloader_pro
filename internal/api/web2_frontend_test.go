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
	index, err := os.ReadFile(filepath.Join("web", "web2", "index.html"))
	require.NoError(t, err)

	assert.Contains(t, string(index), `<script src="/static/shared/datetime.js"></script>`)
	assert.Contains(t, source, "dbUserEntityUpdate:")
	assert.Contains(t, source, "dbListEntityUpdate:")
	assert.Contains(t, source, "dbUserLinkUpdate:")
	assert.Contains(t, source, "type = f.numeric ? 'number' : (f.dateTime ? 'datetime-local' : 'text')")
	assert.Contains(t, source, "const value = f.dateTime ? TMDDateTime.toDateTimeLocal(item[f.key])")
	assert.Contains(t, source, "TMDDateTime.toRFC3339(v)")
	assert.Contains(t, source, "This also permanently deletes the media directory.")
}
