package service

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResult_OnlyMessage(t *testing.T) {
	r := Result{
		Message: "Test message",
	}

	assert.Nil(t, r.Main)
	assert.Nil(t, r.Profile)
	assert.Equal(t, "Test message", r.Message)
}

func TestNopReporter_OnProgress(t *testing.T) {
	reporter := &NopReporter{}

	p := Progress{
		Stage:     "downloading",
		Total:     100,
		Completed: 50,
		Current:   "test_user",
	}

	reporter.OnProgress("task-123", p)
}

func TestNopReporter_OnComplete(t *testing.T) {
	reporter := &NopReporter{}

	r := Result{
		Main: &MainResult{
			Downloaded: 100,
			Failed:     5,
		},
		Message: "Completed",
	}

	reporter.OnComplete("task-123", r)
}

func TestNopReporter_OnError(t *testing.T) {
	reporter := &NopReporter{}

	err := errors.New("test error")
	reporter.OnError("task-123", err)
}

func TestNewLogReporter(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, format)
	}

	reporter := NewLogReporter(logger)

	assert.NotNil(t, reporter)

	logReporter, ok := reporter.(*LogReporter)
	assert.True(t, ok)
	assert.NotNil(t, logReporter.logger)
}

func TestNewLogReporter_NilLogger(t *testing.T) {
	reporter := NewLogReporter(nil)

	assert.NotNil(t, reporter)

	logReporter, ok := reporter.(*LogReporter)
	assert.True(t, ok)
	assert.Nil(t, logReporter.logger)
}

func TestLogReporter_OnProgress_Syncing(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, fmt.Sprintf(format, args...))
	}

	reporter := NewLogReporter(logger)
	reporter.OnProgress("task-123", Progress{Stage: "syncing", Current: "user1"})

	assert.Len(t, loggedMessages, 1)
	assert.Equal(t, `[task] Progress stage=syncing current="user1"`, loggedMessages[0])
}

func TestLogReporter_OnProgress_DownloadingIsSuppressed(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, format)
	}

	reporter := NewLogReporter(logger)
	reporter.OnProgress("task-123", Progress{
		Stage:     "downloading",
		Total:     100,
		Completed: 50,
		Current:   "user1",
	})

	assert.Len(t, loggedMessages, 0)
}

func TestLogReporter_OnProgress_RetryingIsSuppressed(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, fmt.Sprintf(format, args...))
	}

	reporter := NewLogReporter(logger)
	reporter.OnProgress("task-123", Progress{
		Stage:     "retrying",
		Total:     26,
		Completed: 10,
		Failed:    16,
	})

	assert.Empty(t, loggedMessages)
}

func TestLogReporter_OnProgress_Profile(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, format)
	}

	reporter := NewLogReporter(logger)
	reporter.OnProgress("task-123", Progress{Stage: "profile"})

	// profile 阶段进度频繁，不输出日志避免刷屏
	assert.Empty(t, loggedMessages)
}

func TestLogReporter_OnProgress_Marking(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, fmt.Sprintf(format, args...))
	}

	reporter := NewLogReporter(logger)
	reporter.OnProgress("task-123", Progress{Stage: "marking", Current: "user1"})

	assert.Len(t, loggedMessages, 1)
	assert.Equal(t, `[task] Progress stage=marking current="user1"`, loggedMessages[0])
}

func TestLogReporter_OnProgress_DefaultStage(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, fmt.Sprintf(format, args...))
	}

	reporter := NewLogReporter(logger)
	reporter.OnProgress("task-123", Progress{Stage: "custom_stage", Current: "value"})

	assert.Len(t, loggedMessages, 1)
	assert.Equal(t, `[task] Progress stage=custom_stage current="value"`, loggedMessages[0])
}

func TestLogReporter_OnProgress_NilLogger(t *testing.T) {
	reporter := NewLogReporter(nil)

	reporter.OnProgress("task-123", Progress{Stage: "downloading"})
}

func TestLogReporter_OnComplete_WithStats(t *testing.T) {
	var loggedMessages []string
	var loggedArgs []interface{}
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, format)
		loggedArgs = append(loggedArgs, args...)
	}

	reporter := NewLogReporter(logger)
	reporter.OnComplete("task-123", Result{
		Main: &MainResult{
			Downloaded: 100,
			Failed:     5,
		},
		Profile: &ProfileResult{
			Downloaded: 12,
			Failed:     1,
			Versioned:  10,
		},
		Message: "User download completed",
	})

	assert.Len(t, loggedMessages, 1)
	assert.Equal(t, "[task] Result summary=%q", loggedMessages[0])
	assert.Equal(t, "main(downloaded=100, Failedtweet=5), profile(downloaded=12, failed=1, versionedfile=10)", loggedArgs[0])
}

func TestLogReporter_OnComplete_WithoutStats(t *testing.T) {
	var loggedMessages []string
	var loggedArgs []interface{}
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, format)
		loggedArgs = append(loggedArgs, args...)
	}

	reporter := NewLogReporter(logger)
	reporter.OnComplete("task-123", Result{Message: "Done"})

	assert.Len(t, loggedMessages, 1)
	assert.Equal(t, "[task] Result message=%q", loggedMessages[0])
	// 检查 args 中是否包含 "Done"
	found := false
	for _, arg := range loggedArgs {
		if s, ok := arg.(string); ok && s == "Done" {
			found = true
			break
		}
	}
	assert.True(t, found, "Expected 'Done' in logged args")
}

func TestLogReporter_OnComplete_NilLogger(t *testing.T) {
	reporter := NewLogReporter(nil)

	reporter.OnComplete("task-123", Result{Message: "Done"})
}

func TestLogReporter_OnError(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, fmt.Sprintf(format, args...))
	}

	reporter := NewLogReporter(logger)
	err := errors.New("test error")
	reporter.OnError("task-123", err)

	assert.Len(t, loggedMessages, 1)
	assert.Equal(t, `[task] Failed task_id=task-123 error="test error"`, loggedMessages[0])
}

func TestLogReporter_OnError_NilLogger(t *testing.T) {
	reporter := NewLogReporter(nil)

	err := errors.New("test error")
	reporter.OnError("task-123", err)
}

func TestLogReporter_OnError_NilError(t *testing.T) {
	var loggedMessages []string
	logger := func(format string, args ...interface{}) {
		loggedMessages = append(loggedMessages, fmt.Sprintf(format, args...))
	}

	reporter := NewLogReporter(logger)
	reporter.OnError("task-123", nil)

	assert.Len(t, loggedMessages, 1)
	assert.Equal(t, `[task] Failed task_id=task-123 error="<nil>"`, loggedMessages[0])
}

func TestProgressReporter_Interface(t *testing.T) {
	var reporter ProgressReporter = &NopReporter{}
	assert.NotNil(t, reporter)

	reporter.OnProgress("task-1", Progress{})
	reporter.OnComplete("task-1", Result{})
	reporter.OnError("task-1", nil)
}
