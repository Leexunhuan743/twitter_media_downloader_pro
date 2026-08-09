package logging

import "fmt"

// FormattedLogger is the small formatted-logging contract used by clients such
// as Resty and logrus.
type FormattedLogger interface {
	Errorf(format string, args ...interface{})
	Warnf(format string, args ...interface{})
	Debugf(format string, args ...interface{})
}

// SanitizingLogger applies the shared log-safety policy to fully formatted
// messages before forwarding them to another logger.
type SanitizingLogger struct {
	next FormattedLogger
}

// NewSanitizingLogger wraps next with final-output credential and ANSI cleaning.
func NewSanitizingLogger(next FormattedLogger) *SanitizingLogger {
	return &SanitizingLogger{next: next}
}

// Errorf sanitizes and forwards an error-level message.
func (logger *SanitizingLogger) Errorf(format string, args ...interface{}) {
	if logger == nil || logger.next == nil {
		return
	}
	logger.next.Errorf("%s", sanitizedMessage(format, args...))
}

// Warnf sanitizes and forwards a warning-level message.
func (logger *SanitizingLogger) Warnf(format string, args ...interface{}) {
	if logger == nil || logger.next == nil {
		return
	}
	logger.next.Warnf("%s", sanitizedMessage(format, args...))
}

// Debugf sanitizes and forwards a debug-level message.
func (logger *SanitizingLogger) Debugf(format string, args ...interface{}) {
	if logger == nil || logger.next == nil {
		return
	}
	logger.next.Debugf("%s", sanitizedMessage(format, args...))
}

func sanitizedMessage(format string, args ...interface{}) string {
	if len(args) == 0 {
		return SanitizeLogText(format)
	}
	return SanitizeLogText(fmt.Sprintf(format, args...))
}
