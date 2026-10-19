package downloader

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// failingFileWriter 始终拒绝写入，用于验证备份失败后的清理。
type failingFileWriter struct{}

func (failingFileWriter) Write(WriteRequest) (WriteResult, error) {
	return WriteResult{}, errors.New("disk full")
}

func TestVersionManager_CreateVersion_RemovesReservedFileOnWriteFailure(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "clip.mp4")
	require.NoError(t, os.WriteFile(source, []byte("payload"), 0o644))

	vm := NewVersionManagerWithWriter("", nil)
	vm.SetFileWriter(failingFileWriter{})

	_, err := vm.CreateVersion(source)
	require.Error(t, err)

	entries, readErr := os.ReadDir(filepath.Join(dir, defaultVersionsDirName))
	require.NoError(t, readErr)
	assert.Empty(t, entries, "写入失败时不应留下 0 字节的预留备份")
}

func TestVersionManager_PruneKeepsFreshBackupWhenClockRunsBackwards(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "clip.mp4")
	require.NoError(t, os.WriteFile(source, []byte("new"), 0o644))

	// 模拟时钟回退：已有备份的名字都排在新备份之后（夏令时回拨会真实发生）。
	versionsDir := filepath.Join(dir, defaultVersionsDirName)
	require.NoError(t, os.MkdirAll(versionsDir, 0o755))
	future := time.Now().Add(24 * time.Hour)
	for i := 0; i < DefaultMaxVersionsPerFile; i++ {
		name := versionName("clip", ".mp4", future.Add(time.Duration(i)*time.Second))
		require.NoError(t, os.WriteFile(filepath.Join(versionsDir, name), []byte("old"), 0o644))
	}

	vm := NewVersionManagerWithWriter("", nil)
	created, err := vm.CreateVersion(source)
	require.NoError(t, err)

	_, statErr := os.Stat(created)
	assert.NoError(t, statErr, "刚写好的备份不应被清理逻辑删除")
	entries, err := os.ReadDir(versionsDir)
	require.NoError(t, err)
	assert.Len(t, entries, DefaultMaxVersionsPerFile, "清理后应正好保留上限份")
}

func TestVersionManager_PrunesLegacyBackupNames(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "clip.mp4")
	require.NoError(t, os.WriteFile(source, []byte("new"), 0o644))

	// 旧实现的毫秒段不补零：毫秒 <100 时只有 1–2 位，也必须计入保留上限。
	versionsDir := filepath.Join(dir, defaultVersionsDirName)
	require.NoError(t, os.MkdirAll(versionsDir, 0o755))
	for i := 0; i < 25; i++ {
		name := fmt.Sprintf("clip_20240101_1200%02d_%d.mp4", i, i%10)
		require.NoError(t, os.WriteFile(filepath.Join(versionsDir, name), []byte("old"), 0o644))
	}

	vm := NewVersionManagerWithWriter("", nil)
	_, err := vm.CreateVersion(source)
	require.NoError(t, err)

	entries, err := os.ReadDir(versionsDir)
	require.NoError(t, err)
	assert.Len(t, entries, DefaultMaxVersionsPerFile, "旧格式备份也要参与保留上限")
}

func TestVersionManager_CreateVersion_MissingSourceCreatesNothing(t *testing.T) {
	dir := t.TempDir()
	missing := filepath.Join(dir, "never-existed.mp4")

	vm := NewVersionManagerWithWriter("", nil)
	_, err := vm.CreateVersion(missing)
	require.Error(t, err)

	// 源文件不存在时在 Stat 阶段就返回，版本目录不应被创建。
	_, statErr := os.Stat(filepath.Join(dir, defaultVersionsDirName))
	assert.True(t, os.IsNotExist(statErr), "源文件不存在时不应创建版本目录")
}
