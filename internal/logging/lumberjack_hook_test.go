package logging

import (
	"bytes"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLumberjackHook_StripsANSI(t *testing.T) {
	var buf bytes.Buffer
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{ForceColors: true, DisableTimestamp: true})
	logger.AddHook(NewLumberjackHook(&buf))
	logger.SetOutput(bytes.NewBuffer(nil))

	logger.Infof("[download] Tweet media complete \x1b[95mtitle=%q\x1b[0m", "hello")

	got := buf.String()
	require.NotEmpty(t, got)
	assert.NotContains(t, got, "\x1b[")
	assert.Contains(t, got, `title="hello"`)
}
