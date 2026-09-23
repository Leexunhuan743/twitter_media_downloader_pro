package downloader

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"
)

var tweetIDRe = regexp.MustCompile(`_(\d+(?:\(\d+\))?)\.\w+$`)

type DefaultFileWriter struct {
	versionManager VersionManager
	locks          [256]sync.Mutex

	// sweptDirs 记录已清扫过临时文件的目标目录（每个目录每进程只扫一次）。
	sweptMu   sync.Mutex
	sweptDirs map[string]struct{}
}

func (fw *DefaultFileWriter) getLock(path string) *sync.Mutex {
	var hash uint32
	for i := 0; i < len(path); i++ {
		hash = hash*31 + uint32(path[i])
	}
	return &fw.locks[hash%256]
}

// NewFileWriter 创建文件写入器
func NewFileWriter(versionManager VersionManager) *DefaultFileWriter {
	return &DefaultFileWriter{
		versionManager: versionManager,
	}
}

// Write 写入文件
func (fw *DefaultFileWriter) Write(req WriteRequest) (WriteResult, error) {
	// 如果提供了 Reader，使用流式模式
	if req.IsStream() {
		return fw.writeStream(req.Path, req.Reader, req.Size, req.Options)
	}

	result := WriteResult{NewSize: int64(len(req.Data))}

	lock := fw.getLock(req.Path)
	lock.Lock()
	defer lock.Unlock()

	// 1. 检查是否需要跳过
	if req.Options.SkipUnchanged {
		exists, fileInfo, err := fw.fileExists(req.Path)
		if err != nil {
			return result, err
		}
		if exists {
			result.OldSize = fileInfo.Size()
			if fileInfo.Size() == result.NewSize {
				oldHash, hashErr := fw.computeFileHash(req.Path)
				if hashErr != nil {
					log.Warnf("[downloader] Hash check failed path=%q error=%q", logging.Path(req.Path), hashErr.Error())
					return result, hashErr
				}
				newHash := fw.computeDataHash(req.Data)
				if oldHash == newHash {
					// 文件未变化，跳过写入
					result.Success = true
					return result, nil
				}
			}
		}
	}

	// 2. 创建版本备份（如果需要）
	if err := fw.createVersionBackup(req.Path, req.Options.CreateVersion, &result); err != nil {
		return result, err
	}

	// 3. 原子写入
	written, err := fw.atomicWriteFromReader(req.Path, bytes.NewReader(req.Data))
	if err != nil {
		return result, err
	}
	result.NewSize = written

	// 4. 设置修改时间
	setModTime(req.Path, req.Options.ModTime)

	result.Success = true
	return result, nil
}

// writeStream 流式写入文件
func (fw *DefaultFileWriter) writeStream(path string, reader io.Reader, size int64, options WriteOptions) (WriteResult, error) {
	result := WriteResult{NewSize: size}

	lock := fw.getLock(path)
	lock.Lock()
	defer lock.Unlock()

	// 流式模式不支持 SkipUnchanged（无法预先计算 hash）
	// 但可以通过文件大小快速判断
	if options.SkipUnchanged && size > 0 {
		exists, fileInfo, err := fw.fileExists(path)
		if err != nil {
			return result, err
		}
		if exists && fileInfo.Size() == size {
			// 大小相同，假设内容相同（跳过重下载）
			result.OldSize = fileInfo.Size()
			result.Success = true
			return result, nil
		}
	}

	// 创建版本备份（如果需要）
	if err := fw.createVersionBackup(path, options.CreateVersion, &result); err != nil {
		return result, err
	}

	// 原子流式写入
	written, err := fw.atomicWriteFromReader(path, reader)
	if err != nil {
		return result, err
	}

	// 更新实际写入的字节数
	result.NewSize = written

	// 设置修改时间
	setModTime(path, options.ModTime)

	result.Success = true
	return result, nil
}

// createVersionBackup 在目标文件已存在时创建版本备份（旧文件归档到 .versions）。
// 与 Write/writeStream 原内联逻辑逐字等价：文件不存在（或 stat 失败）时静默跳过，
// CreateVersion 失败时原样返回错误；成功时置位 result.Versioned。
func (fw *DefaultFileWriter) createVersionBackup(path string, createVersion bool, result *WriteResult) error {
	if !createVersion || fw.versionManager == nil {
		return nil
	}
	if _, err := os.Stat(path); err != nil {
		return nil
	}
	if _, err := fw.versionManager.CreateVersion(path); err != nil {
		return err
	}
	result.Versioned = true
	return nil
}

// setModTime 设置文件的修改时间；失败仅记录警告，不中断写入流程。
// 与 Write/writeStream 原内联逻辑逐字等价（含日志格式）。
func setModTime(path string, modTime *time.Time) {
	if modTime == nil {
		return
	}
	if err := os.Chtimes(path, time.Time{}, *modTime); err != nil {
		log.Warnf("[downloader] Mod time set failed path=%q error=%q", logging.Path(path), err.Error())
	}
}

// staleTempFileAge 之后才认为 .tmp_* 是异常退出遗留（正在写入的临时文件
// 一定比它新，避免与并发 worker 抢删）。
const staleTempFileAge = time.Hour

// sweepStaleTempFiles 清理目标目录中上次异常退出（强杀/断电）遗留的临时文件。
// 每个目录每个进程只扫一次：临时文件与媒体同目录，无法用一次受限的启动扫描
// 覆盖（.loongtweet/.profile 等深路径），而写入时顺手清扫能随重试/下次运行收敛。
func (fw *DefaultFileWriter) sweepStaleTempFiles(dir string) {
	fw.sweptMu.Lock()
	if fw.sweptDirs == nil {
		fw.sweptDirs = make(map[string]struct{})
	}
	if _, done := fw.sweptDirs[dir]; done {
		fw.sweptMu.Unlock()
		return
	}
	fw.sweptDirs[dir] = struct{}{}
	fw.sweptMu.Unlock()

	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-staleTempFileAge)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), ".tmp_") {
			continue
		}
		info, infoErr := entry.Info()
		if infoErr != nil || info.ModTime().After(cutoff) {
			continue
		}
		tempPath := filepath.Join(dir, entry.Name())
		if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Warnf("[downloader] Stale temp file cleanup failed path=%q error=%q", logging.Path(tempPath), removeErr.Error())
		}
	}
}

// atomicWriteFromReader 原子写入 reader 内容
func (fw *DefaultFileWriter) atomicWriteFromReader(path string, reader io.Reader) (int64, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, fmt.Errorf("failed to create directory %s: %w", dir, err)
	}
	fw.sweepStaleTempFiles(dir)
	pattern := ".tmp_*"
	if m := tweetIDRe.FindStringSubmatch(filepath.Base(path)); len(m) > 1 {
		pattern = ".tmp_*_" + m[1]
	}
	tempFile, err := os.CreateTemp(dir, pattern)
	if err != nil {
		return 0, fmt.Errorf("failed to create temp file: %w", err)
	}
	tempPath := tempFile.Name()

	defer os.Remove(tempPath)

	// 使用缓冲区复制
	buf := make([]byte, 64*1024) // 64KB 缓冲区
	written, err := io.CopyBuffer(tempFile, reader, buf)
	if err != nil {
		tempFile.Close()
		return 0, fmt.Errorf("failed to write to temp file: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		return 0, fmt.Errorf("failed to close temp file: %w", err)
	}

	log.Debugf("[downloader] Atomic write complete path=%q bytes=%d", logging.Path(path), written)

	if err := os.Rename(tempPath, path); err != nil {
		return 0, fmt.Errorf("failed to rename temp file: %w", err)
	}

	return written, nil
}

// fileExists 检查文件是否存在
func (fw *DefaultFileWriter) fileExists(path string) (bool, os.FileInfo, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil, nil
		}
		return false, nil, err
	}
	return true, info, nil
}

// computeFileHash 计算文件 Hash
func (fw *DefaultFileWriter) computeFileHash(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return fw.computeDataHash(data), nil
}

// computeDataHash 计算数据 Hash
func (fw *DefaultFileWriter) computeDataHash(data []byte) string {
	hash := md5.Sum(data)
	return hex.EncodeToString(hash[:])
}
