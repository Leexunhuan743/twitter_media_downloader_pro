package main

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/config"
)

func TestParseBootstrapArgs(t *testing.T) {
	parsed, err := parseBootstrapArgs([]string{
		"-server",
		"-port", "8080",
		"-dbg",
		"-user", "alice",
		"-jsonfile", "export.json",
	})

	require.NoError(t, err)
	assert.True(t, parsed.serverMode)
	assert.True(t, parsed.dbg)
	assert.True(t, parsed.serverPortSet)
	assert.Equal(t, 8080, parsed.serverPort)
	assert.Equal(t, []string{"-user", "alice", "-jsonfile", "export.json"}, parsed.cliArgs)
}

func TestParseBootstrapArgsConfIsBoolean(t *testing.T) {
	parsed, err := parseBootstrapArgs([]string{"-conf", "extra.yaml", "-dbg"})

	require.NoError(t, err)
	assert.True(t, parsed.confArg)
	assert.True(t, parsed.dbg)
	assert.Equal(t, []string{"extra.yaml"}, parsed.cliArgs)
}

func TestParseBootstrapArgsPortValidation(t *testing.T) {
	tests := []struct {
		name        string
		args        []string
		errContains string
	}{
		{name: "missing", args: []string{"-port"}, errContains: "-port requires a value"},
		{name: "next flag", args: []string{"-port", "-dbg"}, errContains: `invalid -port "-dbg"`},
		{name: "negative", args: []string{"-port", "-1"}, errContains: `invalid -port "-1"`},
		{name: "not number", args: []string{"-port", "abc"}, errContains: `invalid -port "abc"`},
		{name: "zero", args: []string{"-port", "0"}, errContains: `invalid -port "0"`},
		{name: "too large", args: []string{"-port", "65536"}, errContains: `invalid -port "65536"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parseBootstrapArgs(tt.args)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.errContains)
		})
	}
}

func TestParseBootstrapArgsPassesUnknownFlagsToCLI(t *testing.T) {
	parsed, err := parseBootstrapArgs([]string{"-unknown", "value", "-user", "alice"})

	require.NoError(t, err)
	assert.Equal(t, []string{"-unknown", "value", "-user", "alice"}, parsed.cliArgs)
}

func TestRunReturnsBootstrapErrors(t *testing.T) {
	err := run([]string{"-port", "invalid"})

	assert.EqualError(t, err, `invalid -port "invalid": must be an integer from 1 to 65535`)
}

func TestRunLogsFinalStartupError(t *testing.T) {
	const helperEnv = "TMD_TEST_RUN_STARTUP_ERROR"
	if os.Getenv(helperEnv) == "1" {
		err := run(nil)
		var logged *loggedError
		if err == nil || !errors.As(err, &logged) {
			os.Exit(2)
		}
		os.Exit(0)
	}

	appRoot := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(appRoot, "conf.yaml"), []byte("root_path: ["), 0600))
	t.Setenv(helperEnv, "1")
	t.Setenv("TMD_HOME", appRoot)
	t.Setenv("TMD_PORT", "")

	cmd := exec.Command(os.Args[0], "-test.run=^TestRunLogsFinalStartupError$")
	output, err := cmd.CombinedOutput()
	require.NoErrorf(t, err, "helper process failed: %s", output)

	logData, err := os.ReadFile(filepath.Join(appRoot, "tmd2.log"))
	require.NoError(t, err)
	assert.Contains(t, string(logData), "[startup] Process failed")
	assert.Contains(t, string(logData), "config load failed")
}

func TestValidateConfigRequiresRootPath(t *testing.T) {
	err := config.Validate(nil)
	assert.EqualError(t, err, "config is nil")

	err = config.Validate(&config.Config{RootPath: "  "})
	assert.EqualError(t, err, "root_path is required; set it in conf.yaml or TMD_ROOT_PATH")

	assert.NoError(t, config.Validate(&config.Config{RootPath: t.TempDir()}))
}

func TestIsEmptyBotConfigError(t *testing.T) {
	assert.True(t, isEmptyBotConfigError(io.EOF))
	assert.False(t, isEmptyBotConfigError(assert.AnError))
	assert.False(t, isEmptyBotConfigError(nil))
}
