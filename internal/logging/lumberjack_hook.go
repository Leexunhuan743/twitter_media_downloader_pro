package logging

import (
	"errors"
	"io"

	"github.com/sirupsen/logrus"
)

var (
	errNilHookWriter = errors.New("logging: nil hook writer")
	errNilLogEntry   = errors.New("logging: nil log entry")
)

// LumberjackHook 是一个 logrus Hook，将日志写入 lumberjack 轮转文件。
// 替代 github.com/rifflock/lfshook（2018 年后未维护）。
type LumberjackHook struct {
	writer io.Writer
}

// NewLumberjackHook 创建一个写入 w 的 Hook。
// w 通常是 *lumberjack.Logger。
func NewLumberjackHook(w io.Writer) *LumberjackHook {
	return &LumberjackHook{writer: w}
}

// Levels 返回所有日志级别，表示所有级别都写入文件。
func (h *LumberjackHook) Levels() []logrus.Level {
	return logrus.AllLevels
}

// Fire 将日志条目序列化为文本后写入文件。
func (h *LumberjackHook) Fire(entry *logrus.Entry) error {
	if h == nil || h.writer == nil {
		return errNilHookWriter
	}
	if entry == nil {
		return errNilLogEntry
	}
	line, err := entry.String()
	if err != nil {
		return err
	}
	line = SanitizeLogText(line)
	written, err := io.WriteString(h.writer, line)
	if err != nil {
		return err
	}
	if written != len(line) {
		return io.ErrShortWrite
	}
	return nil
}
