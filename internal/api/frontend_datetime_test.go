package api

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// @lat: [[lat.md/api-server#API Server#Web UI#Shared Date-Time Contract]]
func TestFrontendDateTimeRoundTrip(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	modulePath, err := filepath.Abs(filepath.Join("web", "shared", "datetime.js"))
	require.NoError(t, err)

	const script = `
const dt = require(process.argv[1]);
const local = dt.toDateTimeLocal('2026-08-09T12:30:00Z');
console.log(JSON.stringify({
  local,
  roundTrip: dt.toRFC3339(local),
  invalidLocal: dt.toDateTimeLocal('not-a-date'),
  invalidUTC: dt.toRFC3339('not-a-date')
}));`

	for _, fixture := range []struct {
		name          string
		timezone      string
		expectedLocal string
	}{
		{name: "UTC+8", timezone: "Asia/Singapore", expectedLocal: "2026-08-09T20:30:00"},
		{name: "UTC-4", timezone: "America/New_York", expectedLocal: "2026-08-09T08:30:00"},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			cmd := exec.Command(node, "-e", script, modulePath)
			cmd.Env = environmentWithTimezone(os.Environ(), fixture.timezone)
			output, err := cmd.Output()
			require.NoError(t, err)

			var actual struct {
				Local        string `json:"local"`
				RoundTrip    string `json:"roundTrip"`
				InvalidLocal string `json:"invalidLocal"`
				InvalidUTC   string `json:"invalidUTC"`
			}
			require.NoError(t, json.Unmarshal(output, &actual))
			assert.Equal(t, fixture.expectedLocal, actual.Local)
			assert.Equal(t, "2026-08-09T12:30:00Z", actual.RoundTrip)
			assert.Empty(t, actual.InvalidLocal)
			assert.Empty(t, actual.InvalidUTC)
		})
	}
}

func TestSharedFrontendDateTimeAssetIsEmbedded(t *testing.T) {
	data, err := readSharedFrontendFile("datetime.js")
	require.NoError(t, err)
	assert.Contains(t, string(data), "root.TMDDateTime = api")
}

func environmentWithTimezone(environment []string, timezone string) []string {
	filtered := make([]string, 0, len(environment)+1)
	for _, entry := range environment {
		if strings.EqualFold(strings.SplitN(entry, "=", 2)[0], "TZ") {
			continue
		}
		filtered = append(filtered, entry)
	}
	return append(filtered, "TZ="+timezone)
}
