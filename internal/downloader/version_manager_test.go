package downloader

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// spyFileWriter 记录 WriteRequest 并把写入转交给真实的文件写入器。
type spyFileWriter struct {
	mu       sync.Mutex
	requests []WriteRequest
	inner    FileWriter
}

func newSpyFileWriter() *spyFileWriter {
	return &spyFileWriter{inner: NewFileWriter(nil)}
}

func (s *spyFileWriter) Write(req WriteRequest) (WriteResult, error) {
	s.mu.Lock()
	s.requests = append(s.requests, req)
	s.mu.Unlock()
	return s.inner.Write(req)
}

func (s *spyFileWriter) snapshot() []WriteRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]WriteRequest(nil), s.requests...)
}

func writeFile(t *testing.T, path string, data []byte) {
	t.Helper()
	require.NoError(t, os.WriteFile(path, data, 0o644))
}

func TestVersionManager_CreateVersion_StreamsSource(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "clip.mp4")
	payload := []byte(strings.Repeat("media-bytes-", 1024))
	writeFile(t, source, payload)

	spy := newSpyFileWriter()
	vm := NewVersionManagerWithWriter("", spy)

	versionPath, err := vm.CreateVersion(source)
	require.NoError(t, err)

	requests := spy.snapshot()
	require.Len(t, requests, 1)
	assert.True(t, requests[0].IsStream(), "版本备份必须以流式方式写出")
	assert.EqualValues(t, len(payload), requests[0].Size)
	assert.Equal(t, versionPath, requests[0].Path)

	got, err := os.ReadFile(versionPath)
	require.NoError(t, err)
	assert.Equal(t, payload, got)

	original, err := os.ReadFile(source)
	require.NoError(t, err)
	assert.Equal(t, payload, original, "创建版本不能改动源文件")
}

func TestVersionManager_CreateVersion_DefaultDirAndNaming(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "document.txt")
	writeFile(t, source, []byte("v1"))

	vm := NewVersionManagerWithWriter(".bak", nil)
	versionPath, err := vm.CreateVersion(source)
	require.NoError(t, err)

	assert.Equal(t, filepath.Join(dir, ".bak"), filepath.Dir(versionPath))
	base := filepath.Base(versionPath)
	assert.True(t, strings.HasPrefix(base, "document_"), base)
	assert.True(t, strings.HasSuffix(base, ".txt"), base)
}

func TestVersionManager_CreateVersion_DirectoryFails(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "folder")
	require.NoError(t, os.Mkdir(nested, 0o755))

	vm := NewVersionManagerWithWriter("", nil)
	_, err := vm.CreateVersion(nested)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "directory")
}

func TestVersionManager_CreateVersion_ConcurrentSameSource(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "same.jpg")
	writeFile(t, source, []byte("same-content"))

	vm := NewVersionManagerWithWriter("", nil)
	const workers = 4
	var wg sync.WaitGroup
	paths := make([]string, workers)
	errs := make([]error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			paths[idx], errs[idx] = vm.CreateVersion(source)
		}(i)
	}
	wg.Wait()

	seen := map[string]bool{}
	for i := 0; i < workers; i++ {
		require.NoError(t, errs[i])
		assert.False(t, seen[paths[i]], "并发备份不能写到同一个文件: %s", paths[i])
		seen[paths[i]] = true
		data, err := os.ReadFile(paths[i])
		require.NoError(t, err)
		assert.Equal(t, []byte("same-content"), data)
	}
}

func TestVersionManager_PrunesOldVersions(t *testing.T) {
	dir := t.TempDir()
	versionsDir := filepath.Join(dir, ".versions")
	require.NoError(t, os.MkdirAll(versionsDir, 0o755))

	// 预置 25 份旧备份，时间戳递增。
	old := make([]string, 0, 25)
	for i := 0; i < 25; i++ {
		stamp := time.Date(2024, 1, 1, 0, 0, i, 0, time.UTC)
		name := versionName("clip", ".mp4", stamp)
		path := filepath.Join(versionsDir, name)
		writeFile(t, path, []byte("old"))
		old = append(old, path)
	}
	// 不应被清理的文件：不同 stem、不同扩展名、时间戳格式不合法。
	keep := []string{
		filepath.Join(versionsDir, versionName("other", ".mp4", time.Now())),
		filepath.Join(versionsDir, versionName("clip", ".txt", time.Now())),
		filepath.Join(versionsDir, "clip_manual_backup.mp4"),
		filepath.Join(versionsDir, "notes.txt"),
	}
	for _, path := range keep {
		writeFile(t, path, []byte("keep"))
	}

	source := filepath.Join(dir, "clip.mp4")
	writeFile(t, source, []byte("new"))

	vm := NewVersionManagerWithWriter(".versions", nil)
	created, err := vm.CreateVersion(source)
	require.NoError(t, err)

	entries, err := os.ReadDir(versionsDir)
	require.NoError(t, err)

	var clips []string
	for _, entry := range entries {
		if isVersionFileName(entry.Name(), "clip", ".mp4") {
			clips = append(clips, entry.Name())
		}
	}
	assert.Len(t, clips, DefaultMaxVersionsPerFile, "只保留上限数量的备份")
	sort.Strings(clips)
	newest := clips[len(clips)-1]
	assert.Equal(t, filepath.Base(created), newest, "最新备份必须保留")

	removed := 0
	for _, path := range old {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			removed++
		}
	}
	assert.Equal(t, len(old)+1-DefaultMaxVersionsPerFile, removed, "最旧的备份应被删除")

	for _, path := range keep {
		_, err := os.Stat(path)
		assert.NoError(t, err, "无关文件不应被清理: %s", path)
	}
}

func TestVersionManager_SetMaxVersions(t *testing.T) {
	dir := t.TempDir()
	versionsDir := filepath.Join(dir, ".versions")
	require.NoError(t, os.MkdirAll(versionsDir, 0o755))
	for i := 0; i < 5; i++ {
		stamp := time.Date(2024, 1, 1, 0, 0, i, 0, time.UTC)
		writeFile(t, filepath.Join(versionsDir, versionName("doc", ".txt", stamp)), []byte("old"))
	}
	source := filepath.Join(dir, "doc.txt")
	writeFile(t, source, []byte("new"))

	vm := NewVersionManagerWithWriter(".versions", nil)
	assert.Equal(t, DefaultMaxVersionsPerFile, vm.MaxVersions())
	vm.SetMaxVersions(2)
	assert.Equal(t, 2, vm.MaxVersions())

	_, err := vm.CreateVersion(source)
	require.NoError(t, err)

	entries, err := os.ReadDir(versionsDir)
	require.NoError(t, err)
	assert.Len(t, entries, 2)
}

func TestVersionManager_ZeroMaxVersionsKeepsEverything(t *testing.T) {
	dir := t.TempDir()
	versionsDir := filepath.Join(dir, ".versions")
	require.NoError(t, os.MkdirAll(versionsDir, 0o755))
	for i := 0; i < 5; i++ {
		stamp := time.Date(2024, 1, 1, 0, 0, i, 0, time.UTC)
		writeFile(t, filepath.Join(versionsDir, versionName("doc", ".txt", stamp)), []byte("old"))
	}
	source := filepath.Join(dir, "doc.txt")
	writeFile(t, source, []byte("new"))

	vm := NewVersionManagerWithWriter(".versions", nil)
	vm.SetMaxVersions(0)
	_, err := vm.CreateVersion(source)
	require.NoError(t, err)

	entries, err := os.ReadDir(versionsDir)
	require.NoError(t, err)
	assert.Len(t, entries, 6)
}

func TestVersionManager_SetFileWriterIsUsed(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "doc.txt")
	writeFile(t, source, []byte("payload"))

	spy := newSpyFileWriter()
	vm := NewVersionManagerWithWriter("", nil)
	vm.SetFileWriter(spy)

	_, err := vm.CreateVersion(source)
	require.NoError(t, err)
	assert.Len(t, spy.snapshot(), 1)
}

func TestIsVersionFileName(t *testing.T) {
	cases := []struct {
		name  string
		stem  string
		ext   string
		match bool
	}{
		{"clip_20240101_000000_007.mp4", "clip", ".mp4", true},
		{"clip_20240101_000000_007", "clip", "", true},
		{"clip_2024_01_000000_007.mp4", "clip", ".mp4", false},
		{"clip_20240101_000000_00.mp4", "clip", ".mp4", false},
		{"clip_20240101_000000_00a.mp4", "clip", ".mp4", false},
		{"clip_manual_backup.mp4", "clip", ".mp4", false},
		{"other_20240101_000000_007.mp4", "clip", ".mp4", false},
		{"clip_20240101_000000_007.txt", "clip", ".mp4", false},
	}
	for _, tc := range cases {
		assert.Equal(t, tc.match, isVersionFileName(tc.name, tc.stem, tc.ext), tc.name)
	}
}
