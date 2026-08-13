package path

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// StorePath 存储路径
type StorePath struct {
	Root           string
	Users          string
	Data           string
	DB             string
	ErrorsPath     string
	JSONErrorsPath string
}

// NormalizeRoot 规范化存储根路径：去首尾空白、校验非空、Clean 后取绝对路径。
// 这是全仓库 root 归一化的唯一实现；config 层的急切 MkdirAll 也在其之上。
func NormalizeRoot(root string) (string, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return "", fmt.Errorf("root path cannot be empty")
	}

	abs, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return "", err
	}
	return abs, nil
}

// NewStorePath 创建存储路径
func NewStorePath(root string) (*StorePath, error) {
	root, err := NormalizeRoot(root)
	if err != nil {
		return nil, err
	}
	sp := &StorePath{Root: root}
	sp.Users = filepath.Join(root, "users")
	sp.Data = filepath.Join(root, ".data")
	sp.DB = filepath.Join(sp.Data, "foo.db")
	sp.ErrorsPath = filepath.Join(sp.Data, "errors.json")
	sp.JSONErrorsPath = filepath.Join(sp.Data, "json_errors.json")

	for _, dir := range []string{sp.Root, sp.Users, sp.Data} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
	}
	return sp, nil
}
