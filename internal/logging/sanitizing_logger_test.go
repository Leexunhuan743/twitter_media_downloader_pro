package logging

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

type capturedFormattedLog struct {
	level   string
	message string
}

func (log *capturedFormattedLog) Errorf(format string, args ...interface{}) {
	log.capture("error", format, args...)
}

func (log *capturedFormattedLog) Warnf(format string, args ...interface{}) {
	log.capture("warn", format, args...)
}

func (log *capturedFormattedLog) Debugf(format string, args ...interface{}) {
	log.capture("debug", format, args...)
}

func (log *capturedFormattedLog) capture(level, format string, args ...interface{}) {
	log.level = level
	log.message = fmt.Sprintf(format, args...)
}

func TestSanitizingLoggerFormatsBeforeCleaning(t *testing.T) {
	tests := []struct {
		name  string
		level string
		write func(*SanitizingLogger)
	}{
		{name: "error", level: "error", write: func(log *SanitizingLogger) { log.Errorf("token=%s", "error-secret") }},
		{name: "warn", level: "warn", write: func(log *SanitizingLogger) { log.Warnf("token=%s", "warn-secret") }},
		{name: "debug", level: "debug", write: func(log *SanitizingLogger) { log.Debugf("token=%s", "debug-secret") }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			captured := &capturedFormattedLog{}
			test.write(NewSanitizingLogger(captured))

			assert.Equal(t, test.level, captured.level)
			assert.NotContains(t, captured.message, test.level+"-secret")
			assert.Contains(t, captured.message, "[redacted:")
		})
	}
}

func TestSanitizingLoggerRedactsURLUserInfo(t *testing.T) {
	captured := &capturedFormattedLog{}
	logger := NewSanitizingLogger(captured)

	logger.Debugf("GET %s", "https://url-user:url-password@example.invalid/media")

	assert.NotContains(t, captured.message, "url-user")
	assert.NotContains(t, captured.message, "url-password")
	assert.Contains(t, captured.message, "redacted")
}

func TestSanitizingLoggerNilSinkIsNoOp(t *testing.T) {
	assert.NotPanics(t, func() {
		NewSanitizingLogger(nil).Debugf("token=secret")
	})
}
