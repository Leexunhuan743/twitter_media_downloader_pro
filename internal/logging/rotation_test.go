package logging

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestNewRotatingWriterContract 锁定轮转参数契约：
// 单文件 2MB、保留 2 份、14 天、gzip 压缩（readme 与 main.go 依赖这些值）。
func TestNewRotatingWriterContract(t *testing.T) {
	w := NewRotatingWriter("logs/app.log")

	assert.Equal(t, "logs/app.log", w.Filename)
	assert.Equal(t, 2, w.MaxSize)
	assert.Equal(t, 2, w.MaxBackups)
	assert.Equal(t, 14, w.MaxAge)
	assert.True(t, w.Compress)
}

// TestNewTextFormatterSharedFields 锁定共享 formatter 的基础配置。
func TestNewTextFormatterSharedFields(t *testing.T) {
	f := NewTextFormatter()

	assert.True(t, f.FullTimestamp)
	assert.True(t, f.DisableSorting)
	assert.False(t, f.PadLevelText)
	// 差异字段保持零值，由调用方显式覆盖
	assert.False(t, f.ForceColors)
	assert.False(t, f.DisableQuote)
}
