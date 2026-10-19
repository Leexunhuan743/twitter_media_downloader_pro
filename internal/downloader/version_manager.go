package downloader

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"
)

const (
	defaultVersionsDirName = ".versions"

	// DefaultMaxVersionsPerFile 是每个文件保留的版本备份数量上限。
	// 版本备份只用于找回被覆盖的旧内容，保留最近若干份即可，避免 .versions 无限增长。
	DefaultMaxVersionsPerFile = 20
)

// DefaultVersionManager 把被覆盖的文件备份到同级的版本目录。
// 同一时刻的并发写入由 fileWriter 的路径锁串行化，版本创建本身不额外加锁。
type DefaultVersionManager struct {
	mu              sync.RWMutex
	versionsDirName string
	fileWriter      FileWriter
	fallbackWriter  FileWriter
	maxVersions     int
}

func NewVersionManagerWithWriter(versionsDirName string, fw FileWriter) *DefaultVersionManager {
	if versionsDirName == "" {
		versionsDirName = defaultVersionsDirName
	}
	return &DefaultVersionManager{
		versionsDirName: versionsDirName,
		fileWriter:      fw,
		fallbackWriter:  NewFileWriter(nil),
		maxVersions:     DefaultMaxVersionsPerFile,
	}
}

// SetFileWriter 设置用于写出备份文件的 FileWriter。
func (vm *DefaultVersionManager) SetFileWriter(fw FileWriter) {
	vm.mu.Lock()
	vm.fileWriter = fw
	vm.mu.Unlock()
}

// SetMaxVersions 设置每个文件保留的版本数量上限；n <= 0 表示不清理历史版本。
func (vm *DefaultVersionManager) SetMaxVersions(n int) {
	vm.mu.Lock()
	vm.maxVersions = n
	vm.mu.Unlock()
}

// MaxVersions 返回当前保留上限。
func (vm *DefaultVersionManager) MaxVersions() int {
	vm.mu.RLock()
	defer vm.mu.RUnlock()
	return vm.maxVersions
}

// CreateVersion 把 sourcePath 的当前内容复制到同级版本目录，返回备份文件路径。
// 复制以流式方式写出，不会把整个文件读入内存；写入成功后按保留上限清理最旧的备份。
func (vm *DefaultVersionManager) CreateVersion(sourcePath string) (string, error) {
	if sourcePath == "" {
		return "", fmt.Errorf("source path cannot be empty")
	}
	info, err := os.Stat(sourcePath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", fmt.Errorf("source path is a directory: %s", sourcePath)
	}

	filename := filepath.Base(sourcePath)
	ext := filepath.Ext(filename)
	stem := strings.TrimSuffix(filename, ext)
	if stem == "" {
		stem = "_unknown"
	}
	versionsDir := filepath.Join(filepath.Dir(sourcePath), vm.versionsDirName)
	if err := os.MkdirAll(versionsDir, 0755); err != nil {
		return "", err
	}
	versionPath, err := reserveVersionPath(versionsDir, stem, ext, time.Now())
	if err != nil {
		return "", err
	}

	source, err := os.Open(sourcePath)
	if err != nil {
		return "", err
	}
	defer source.Close()

	if _, err := vm.writer().Write(WriteRequest{Path: versionPath, Reader: source, Size: info.Size()}); err != nil {
		// 预留的空文件在写入失败时删除，避免留下 0 字节备份。
		os.Remove(versionPath)
		return versionPath, err
	}
	vm.pruneVersions(versionsDir, stem, ext)
	return versionPath, nil
}

func (vm *DefaultVersionManager) writer() FileWriter {
	vm.mu.RLock()
	defer vm.mu.RUnlock()
	if vm.fileWriter != nil {
		return vm.fileWriter
	}
	return vm.fallbackWriter
}

// versionName 生成 <stem>_<YYYYMMDD>_<HHMMSS>_<毫秒> 形式的备份文件名。
// 毫秒部分固定三位，保证同一前缀下的文件名可以按字典序等同于时间序排序。
func versionName(stem, ext string, now time.Time) string {
	return fmt.Sprintf("%s_%s_%03d%s", stem, now.Format("20060102_150405"), now.Nanosecond()/int(time.Millisecond), ext)
}

// reserveVersionPath 以 O_EXCL 预留一个备份文件路径。
// 同一毫秒内的并发备份会顺延毫秒位，保证不会互相覆盖。
func reserveVersionPath(versionsDir, stem, ext string, now time.Time) (string, error) {
	var lastErr error
	for i := 0; i <= 1000; i++ {
		path := filepath.Join(versionsDir, versionName(stem, ext, now.Add(time.Duration(i)*time.Millisecond)))
		file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err == nil {
			file.Close()
			return path, nil
		}
		if !os.IsExist(err) {
			return "", err
		}
		lastErr = err
	}
	return "", fmt.Errorf("failed to reserve version path: %w", lastErr)
}

// pruneVersions 删除同一文件超出保留上限的最旧备份。清理失败只记录日志，
// 不影响已完成的备份。
func (vm *DefaultVersionManager) pruneVersions(versionsDir, stem, ext string) {
	limit := vm.MaxVersions()
	if limit <= 0 {
		return
	}
	entries, err := os.ReadDir(versionsDir)
	if err != nil {
		log.Warnf("[downloader] Version cleanup scan failed dir=%q error=%q", logging.Path(versionsDir), err.Error())
		return
	}
	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isVersionFileName(entry.Name(), stem, ext) {
			continue
		}
		paths = append(paths, filepath.Join(versionsDir, entry.Name()))
	}
	if len(paths) <= limit {
		return
	}
	sort.Strings(paths)
	stale := paths[:len(paths)-limit]
	removed := 0
	for _, path := range stale {
		if err := os.Remove(path); err != nil {
			log.Warnf("[downloader] Version cleanup failed path=%q error=%q", logging.Path(path), err.Error())
			continue
		}
		removed++
	}
	if removed > 0 {
		log.Infof("[downloader] Version cleanup dir=%q removed=%d kept=%d", logging.Path(versionsDir), removed, limit)
	}
}

// isVersionFileName 判断 name 是否形如 <stem>_<YYYYMMDD>_<HHMMSS>_<NNN><ext>。
func isVersionFileName(name, stem, ext string) bool {
	if !strings.HasPrefix(name, stem+"_") || !strings.HasSuffix(name, ext) {
		return false
	}
	rest := strings.TrimSuffix(strings.TrimPrefix(name, stem+"_"), ext)
	parts := strings.Split(rest, "_")
	if len(parts) != 3 || len(parts[0]) != 8 || len(parts[1]) != 6 || len(parts[2]) != 3 {
		return false
	}
	for _, part := range parts {
		if _, err := strconv.Atoi(part); err != nil {
			return false
		}
	}
	return true
}
