package logging

import (
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

// TestRotatingWriterRotatesWhenFileExceedsMaxSize 守护「按尺寸轮转且不丢日志」：
// 超出 MaxSize 的写入必须把当前文件移成备份并新建当前文件，且备份（解压后）
// 与当前文件拼接后的内容与写入内容逐字节一致。
func TestRotatingWriterRotatesWhenFileExceedsMaxSize(t *testing.T) {
	dir := t.TempDir()
	logPath := filepath.Join(dir, "app.log")

	w := NewRotatingWriter(logPath)
	// 生产值 2MB 不适合测试；压到 1MB，仍走同一构造路径、保留策略与压缩配置。
	w.MaxSize = 1
	t.Cleanup(func() { _ = w.Close() })

	const chunkSize = 64 * 1024
	chunk := bytes.Repeat([]byte("0123456789abcdef"), chunkSize/16)

	var written bytes.Buffer
	// 16 块刚好写满 1MB（不触发轮转），第 17 块触发一次轮转。
	for range 17 {
		n, err := w.Write(chunk)
		require.NoError(t, err)
		require.Equal(t, len(chunk), n)
		written.Write(chunk)
	}
	require.NoError(t, w.Close())

	backup := waitForRotation(t, dir, filepath.Base(logPath), int64(16*chunkSize))

	current, err := os.ReadFile(logPath)
	require.NoError(t, err)
	require.Len(t, current, chunkSize, "current file should hold only post-rotation writes")

	combined := make([]byte, 0, len(backup)+len(current))
	combined = append(combined, backup...)
	combined = append(combined, current...)
	assert.Equal(t, written.Bytes(), combined, "rotated logs must preserve every written byte")
}

// waitForRotation 轮询备份文件（lumberjack 的压缩是异步的），返回解压后的
// 备份内容；备份字节数在超时前未达到 want 则判失败。
func waitForRotation(t *testing.T, dir, currentName string, want int64) []byte {
	t.Helper()

	deadline := time.Now().Add(15 * time.Second)
	var lastFiles []string
	for {
		entries, err := os.ReadDir(dir)
		require.NoError(t, err)

		var backups []string
		for _, entry := range entries {
			if entry.Name() == currentName {
				continue
			}
			backups = append(backups, entry.Name())
		}
		sort.Strings(backups)
		lastFiles = backups

		var data []byte
		complete := len(backups) > 0
		for _, name := range backups {
			content, err := readBackupFile(filepath.Join(dir, name))
			if err != nil {
				complete = false
				break
			}
			data = append(data, content...)
		}
		if complete && int64(len(data)) == want {
			return data
		}
		if time.Now().After(deadline) {
			t.Fatalf("no complete %d-byte rotation backup produced; files=%v", want, lastFiles)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func readBackupFile(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if !strings.HasSuffix(path, ".gz") {
		return data, nil
	}
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return io.ReadAll(reader)
}
