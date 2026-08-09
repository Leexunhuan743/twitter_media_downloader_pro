package logging

import (
	"bytes"
	"io"
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

func TestLumberjackHook_RedactsSensitiveText(t *testing.T) {
	var buf bytes.Buffer
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{DisableTimestamp: true})
	logger.AddHook(NewLumberjackHook(&buf))
	logger.SetOutput(io.Discard)

	logger.Infof("[auth] Rejected token=plain-secret")

	assert.NotContains(t, buf.String(), "plain-secret")
	assert.Contains(t, buf.String(), "[redacted:")
}

func TestLumberjackHook_InvalidInputsReturnErrors(t *testing.T) {
	entry := logrus.NewEntry(logrus.New())
	entry.Message = "test"

	var nilWriterErr error
	assert.NotPanics(t, func() {
		nilWriterErr = NewLumberjackHook(nil).Fire(entry)
	})
	assert.Error(t, nilWriterErr)

	var nilEntryErr error
	assert.NotPanics(t, func() {
		nilEntryErr = NewLumberjackHook(io.Discard).Fire(nil)
	})
	assert.Error(t, nilEntryErr)
}

type shortWriter struct{}

func (shortWriter) Write(p []byte) (int, error) {
	return len(p) - 1, nil
}

func TestLumberjackHook_ReportsShortWrite(t *testing.T) {
	entry := logrus.NewEntry(logrus.New())
	entry.Message = "test"

	assert.ErrorIs(t, NewLumberjackHook(shortWriter{}).Fire(entry), io.ErrShortWrite)
}
