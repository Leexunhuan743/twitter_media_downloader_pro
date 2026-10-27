package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
)

const (
	backupDirName        = "backups"
	maxConfigBackupCount = 10
)

// backupStampMu 与 lastBackupStamp 保证备份文件名中的时间戳单调递增。
// 系统时钟精度在 Windows 上可低至毫秒级，连续两次 time.Now().UnixNano()
// 可能取到同一个值；重名会让后一次 os.WriteFile 覆盖前一份备份，
// 使备份份数少于预期。
var (
	backupStampMu   sync.Mutex
	lastBackupStamp = make(map[string]int64)
)

// nextBackupStamp 返回 backupDir 下唯一且单调递增的时间戳。
// 同一目录的上一次时间戳大于等于当前时钟值时，取上一次 +1；
// 再跳过磁盘上已存在的备份名，覆盖进程重启后 map 为空的情况。
func nextBackupStamp(backupDir, sourceBase string) int64 {
	backupStampMu.Lock()
	defer backupStampMu.Unlock()

	stamp := time.Now().UnixNano()
	if last := lastBackupStamp[backupDir]; stamp <= last {
		stamp = last + 1
	}
	for {
		name := fmt.Sprintf("%s.backup.%d", sourceBase, stamp)
		if _, err := os.Stat(filepath.Join(backupDir, name)); os.IsNotExist(err) {
			break
		}
		stamp++
	}
	lastBackupStamp[backupDir] = stamp
	return stamp
}

// CreateBackup 在源文件同级的 backups/ 子目录下创建带纳秒时间戳的备份。
// 返回相对于源文件目录的备份路径（如 "backups/conf.yaml.backup.123456789"）。
// 文件不存在时返回 ("", nil)，不视为错误。
// 创建后自动修剪旧备份，保留最近 maxConfigBackupCount 份。
func CreateBackup(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}

	backupDir := filepath.Join(filepath.Dir(filePath), backupDirName)
	if err := os.MkdirAll(backupDir, 0700); err != nil {
		return "", err
	}

	backupName := fmt.Sprintf("%s.backup.%d", filepath.Base(filePath), nextBackupStamp(backupDir, filepath.Base(filePath)))
	backupPath := filepath.Join(backupDir, backupName)
	if err := os.WriteFile(backupPath, data, 0600); err != nil {
		return "", err
	}

	pruneConfigBackups(backupDir)
	return filepath.Join(backupDirName, backupName), nil
}

// pruneConfigBackups 修剪 backups/ 目录中的旧备份，按源文件分组，
// 每个源文件仅保留最近 maxConfigBackupCount 份。
// 文件名格式 {source}.backup.{nanotimestamp}，时间戳天然有序。
func pruneConfigBackups(backupDir string) {
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		log.Warnf("[config] Failed to list backup directory %q: %v", backupDir, err)
		return
	}

	// 按源文件分组：conf.yaml.backup.123 → 按 conf.yaml 分组
	groups := make(map[string][]os.DirEntry)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		idx := strings.Index(name, ".backup.")
		if idx < 0 {
			continue
		}
		sourceFile := name[:idx]
		groups[sourceFile] = append(groups[sourceFile], entry)
	}

	for _, backups := range groups {
		if len(backups) <= maxConfigBackupCount {
			continue
		}
		sort.Slice(backups, func(i, j int) bool {
			return backups[i].Name() < backups[j].Name()
		})
		for _, entry := range backups[:len(backups)-maxConfigBackupCount] {
			if err := os.Remove(filepath.Join(backupDir, entry.Name())); err != nil && !os.IsNotExist(err) {
				log.Warnf("[config] Failed to remove stale backup %q: %v", entry.Name(), err)
			}
		}
	}
}
