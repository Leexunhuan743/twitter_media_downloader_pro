package service

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
)

// JSON 导入路径约束的判定边界。两个真实回归都在这里：
//  1. 用裸根做 HasPrefix 会把兄弟目录一起放行（root=…/data 时 …/data-evil 通过）。
//  2. 卷根（`C:\`、`/`）拼分隔符后变成 `C:\\`、`//`，导致该根下所有路径被拒。
func TestPathWithinAnyRoot(t *testing.T) {
	root := filepath.Join(t.TempDir(), "data")
	sep := string(filepath.Separator)

	assert.True(t, pathWithinAnyRoot(root, []string{root}), "root itself must be allowed")
	assert.True(t, pathWithinAnyRoot(filepath.Join(root, "a", "x.json"), []string{root}), "path under root must be allowed")
	assert.False(t, pathWithinAnyRoot(filepath.Join(root+"-evil", "x.json"), []string{root}), "sibling prefix must be rejected")
	assert.False(t, pathWithinAnyRoot(filepath.Dir(root), []string{root}), "parent directory must be rejected")
	assert.False(t, pathWithinAnyRoot(filepath.Join(root, "..", "outside.json"), []string{root}), "traversal must be rejected")

	// 卷根：要求该根下的普通路径被放行（此前会因 `C:\\` / `//` 前缀被全量拒绝）。
	volumeRoot := filepath.VolumeName(root) + sep
	if runtime.GOOS != "windows" {
		volumeRoot = sep
	}
	assert.True(t, pathWithinAnyRoot(filepath.Join(volumeRoot, "anywhere", "x.json"), []string{volumeRoot}),
		"paths under a volume root must be allowed")
	assert.True(t, pathWithinAnyRoot(volumeRoot, []string{volumeRoot}), "the volume root itself must be allowed")

	// 多根：下载根与 app root 任一命中即可。
	appRoot := filepath.Join(t.TempDir(), "app")
	assert.True(t, pathWithinAnyRoot(filepath.Join(appRoot, "uploads", "x.json"), []string{root, appRoot}))
	assert.False(t, pathWithinAnyRoot(filepath.Join(t.TempDir(), "x.json"), []string{root, appRoot}))

	// Windows 下大小写不敏感（与 entity.comparablePath 同语义）。
	if runtime.GOOS == "windows" {
		upper := filepath.Join(root, "Sub", "X.JSON")
		assert.True(t, pathWithinAnyRoot(upper, []string{root}), "Windows path comparison must be case-insensitive")
	}

	// 空根列表与临时目录本身的表现（防御性边界，确保不会 panic）。
	assert.False(t, pathWithinAnyRoot(os.TempDir(), nil))
}
