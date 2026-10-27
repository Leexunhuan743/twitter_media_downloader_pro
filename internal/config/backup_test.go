package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateBackupWritesToSharedBackupDir(t *testing.T) {
	root := t.TempDir()
	confPath := filepath.Join(root, "conf.yaml")
	cookiesPath := filepath.Join(root, "additional_cookies.yaml")
	require.NoError(t, os.WriteFile(confPath, []byte("root_path: old"), 0600))
	require.NoError(t, os.WriteFile(cookiesPath, []byte("- auth_token: old"), 0600))

	confBackup, err := CreateBackup(confPath)
	require.NoError(t, err)
	cookiesBackup, err := CreateBackup(cookiesPath)
	require.NoError(t, err)

	assert.True(t, strings.HasPrefix(confBackup, backupDirName+string(filepath.Separator)))
	assert.True(t, strings.HasPrefix(cookiesBackup, backupDirName+string(filepath.Separator)))
	assert.FileExists(t, filepath.Join(root, confBackup))
	assert.FileExists(t, filepath.Join(root, cookiesBackup))
}

func TestCreateBackupKeepsLatestTenInSharedBackupDir(t *testing.T) {
	root := t.TempDir()
	confPath := filepath.Join(root, "conf.yaml")
	cookiesPath := filepath.Join(root, "additional_cookies.yaml")

	for i := 0; i < maxConfigBackupCount+3; i++ {
		require.NoError(t, os.WriteFile(confPath, []byte{byte(i)}, 0600))
		_, err := CreateBackup(confPath)
		require.NoError(t, err)
	}
	for i := 0; i < 2; i++ {
		require.NoError(t, os.WriteFile(cookiesPath, []byte{byte(i)}, 0600))
		_, err := CreateBackup(cookiesPath)
		require.NoError(t, err)
	}

	entries, err := os.ReadDir(filepath.Join(root, backupDirName))
	require.NoError(t, err)

	backups := 0
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".backup.") {
			backups++
		}
	}

	// 按源文件分组保留最近 10 份：conf.yaml 保留 10 份，cookies.yaml 保留 2 份，共 12 份
	assert.Equal(t, maxConfigBackupCount+2, backups)
}

func TestCreateBackupMissingSourceIsNoop(t *testing.T) {
	backupName, err := CreateBackup(filepath.Join(t.TempDir(), "missing.yaml"))

	require.NoError(t, err)
	assert.Empty(t, backupName)
}

func TestCreateBackupPrunesPerSourceFile(t *testing.T) {
	root := t.TempDir()
	confPath := filepath.Join(root, "conf.yaml")
	schedPath := filepath.Join(root, "schedules.yaml")

	// conf.yaml 备份 15 份 → 保留 10 份，删除 5 份
	for i := 0; i < 15; i++ {
		require.NoError(t, os.WriteFile(confPath, []byte{byte(i)}, 0600))
		_, err := CreateBackup(confPath)
		require.NoError(t, err)
	}
	// schedules.yaml 备份 3 份 → 全部保留（≤10）
	for i := 0; i < 3; i++ {
		require.NoError(t, os.WriteFile(schedPath, []byte{byte(i)}, 0600))
		_, err := CreateBackup(schedPath)
		require.NoError(t, err)
	}

	entries, err := os.ReadDir(filepath.Join(root, backupDirName))
	require.NoError(t, err)

	confCount := 0
	schedCount := 0
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "conf.yaml.backup.") {
			confCount++
		}
		if strings.HasPrefix(entry.Name(), "schedules.yaml.backup.") {
			schedCount++
		}
	}

	assert.Equal(t, maxConfigBackupCount, confCount, "conf.yaml 应保留 10 份")
	assert.Equal(t, 3, schedCount, "schedules.yaml 应保留全部 3 份")
}

// 同一秒钟内的连续备份不能重名。系统时钟精度低时两次 time.Now().UnixNano()
// 会取到同一个值，重名让后一次写入覆盖前一份，备份份数因此偏少。
func TestCreateBackupUniqueNamesWithinSameTick(t *testing.T) {
	root := t.TempDir()
	confPath := filepath.Join(root, "conf.yaml")
	require.NoError(t, os.WriteFile(confPath, []byte("root_path: x"), 0600))

	const runs = 50
	names := make(map[string]struct{}, runs)
	for i := 0; i < runs; i++ {
		name, err := CreateBackup(confPath)
		require.NoError(t, err)
		require.NotEmpty(t, name)
		_, dup := names[name]
		require.False(t, dup, "备份名重复：%s", name)
		names[name] = struct{}{}
	}

	entries, err := os.ReadDir(filepath.Join(root, backupDirName))
	require.NoError(t, err)
	// 上限 10 份，其余在创建时已被修剪；留下的必须是 10 份不同的文件。
	assert.Equal(t, maxConfigBackupCount, len(entries))
}

// 备份文件名的时间戳必须随创建顺序递增，修剪依据的就是这个顺序。
func TestCreateBackupTimestampsIncrease(t *testing.T) {
	root := t.TempDir()
	confPath := filepath.Join(root, "conf.yaml")
	require.NoError(t, os.WriteFile(confPath, []byte("root_path: x"), 0600))

	var stamps []string
	for i := 0; i < 5; i++ {
		name, err := CreateBackup(confPath)
		require.NoError(t, err)
		idx := strings.Index(name, ".backup.")
		require.GreaterOrEqual(t, idx, 0)
		stamps = append(stamps, name[idx+len(".backup."):])
	}
	for i := 1; i < len(stamps); i++ {
		require.NotEqual(t, len(stamps[i-1]), 0)
		// 长度不同的数字串按字典序比较会失真，比较前对齐到同一宽度。
		width := len(stamps[i])
		if len(stamps[i-1]) > width {
			width = len(stamps[i-1])
		}
		prev := strings.Repeat("0", width-len(stamps[i-1])) + stamps[i-1]
		cur := strings.Repeat("0", width-len(stamps[i])) + stamps[i]
		assert.Less(t, prev, cur, "时间戳应递增")
	}
}
