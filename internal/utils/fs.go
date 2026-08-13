package utils

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"
)

var (
	reURL           = regexp.MustCompile(`(https?|ftp|file)://[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]`)
	reWinNonSupport = regexp.MustCompile(`[/\\:*?"<>\|]`)
)

// ErrEmptyPath indicates that a path operation received an empty path.
var ErrEmptyPath = errors.New("path is empty")

func PathExists(path string) (bool, error) {
	_, err := os.Lstat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// DefaultMaxFileNameLen reserves space for extensions and collision suffixes.
const DefaultMaxFileNameLen = 158

// sanitizeFileNameCore 是 WinFileNameWithMaxLen 与 Stable 变体共享的清洗核心：
// 剔除 URL/非法字符、控制字符归一，并按 UTF-8 字节预算截断。调用方决定
// 是否裁剪首尾空白与做保留名检查（两个变体的历史分叉点）。
func sanitizeFileNameCore(name string, maxLen int) string {
	name = reURL.ReplaceAllString(name, "")
	name = reWinNonSupport.ReplaceAllString(name, "")

	var buffer bytes.Buffer
	for _, ch := range name {
		switch ch {
		case '\r':
			continue
		case '\n':
			ch = ' '
		default:
			if ('\x00' <= ch && ch < '\x20') || ch == '\x7f' {
				continue
			}
		}

		if buffer.Len()+utf8.RuneLen(ch) > maxLen {
			break
		}
		buffer.WriteRune(ch)
	}
	return buffer.String()
}

// WinFileNameWithMaxLen 将名称转换为有效的 Windows 文件名。
// maxLen 指定 UTF-8 字节长度上限。
func WinFileNameWithMaxLen(name string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	result := sanitizeFileNameCore(name, maxLen)
	result = strings.TrimRight(result, " .")
	if isWindowsReservedFileName(result) {
		result = "_" + result
	}
	result = TruncateUTF8(result, maxLen)
	return strings.TrimRight(result, " .")
}

// WinFileNameWithMaxLenStable 与 WinFileNameWithMaxLen 相同，但保留输入的首尾
// 空白与尾点（不做 TrimSpace/TrimRight(" .")）。tweet 媒体文件名在旧版本中
// 不裁剪这些字符，升级后若裁剪会导致已下载文件被改名、触发重复下载；因此
// tweet 文本路径必须使用本函数保持文件名稳定。控制字符仍被剔除：旧版本对
// 含控制字符的文本在 Windows 上本就无法创建文件，不存在需要兼容的旧文件。
// 注意平台差异：在 Linux/macOS 上控制字符是合法文件名，旧版本可能在升级前
// 创建过含控制字符的文件（如 "a\x01b_123.jpg"）；升级后同一推文重新拉取会
// 生成剔除控制字符的新名（"ab_123.jpg"），旧文件成为孤儿——仅一次性重复
// 下载+残留，不损坏数据，且只在升级后重新拉取该推文时发生。
func WinFileNameWithMaxLenStable(name string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	return sanitizeFileNameCore(name, maxLen)
}

// WinFileNameWithMaxLenLegacy reproduces the tweet filename sanitization used
// before control characters were removed. It exists solely to locate an
// already-written POSIX filename during an upgrade; new filenames must use the
// current sanitizers above.
func WinFileNameWithMaxLenLegacy(name string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	name = reURL.ReplaceAllString(name, "")
	name = reWinNonSupport.ReplaceAllString(name, "")

	var buffer bytes.Buffer
	for _, ch := range name {
		switch ch {
		case '\r':
			continue
		case '\n':
			ch = ' '
		}

		if buffer.Len()+utf8.RuneLen(ch) > maxLen {
			break
		}
		buffer.WriteRune(ch)
	}
	return buffer.String()
}

// TruncateUTF8 truncates value to at most maxLen UTF-8 bytes without splitting
// a rune. It is the single implementation shared across packages (the naming
// package previously carried a private copy). A non-positive maxLen yields the
// empty string; the caller must not rely on value being preserved for maxLen 0.
func TruncateUTF8(value string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	if len(value) <= maxLen {
		return value
	}
	end := maxLen
	for end > 0 && !utf8.RuneStart(value[end]) {
		end--
	}
	return value[:end]
}

func isWindowsReservedFileName(name string) bool {
	return IsWindowsReservedFileName(name)
}

// IsWindowsReservedFileName reports whether name would collide with a Windows
// reserved device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9 and their typed
// variants), including names with an extension such as "CON.txt".
func IsWindowsReservedFileName(name string) bool {
	stem, _, _ := strings.Cut(name, ".")
	stem = strings.ToUpper(strings.TrimRight(stem, " "))
	switch stem {
	case "CON", "PRN", "AUX", "NUL", "CLOCK$", "CONIN$", "CONOUT$",
		"COM¹", "COM²", "COM³", "LPT¹", "LPT²", "LPT³":
		return true
	}
	if len(stem) == 4 && (strings.HasPrefix(stem, "COM") || strings.HasPrefix(stem, "LPT")) {
		return stem[3] >= '1' && stem[3] <= '9'
	}
	return false
}

const maxUniquePathRetries = 10000

func UniquePath(path string) (string, error) {
	if path == "" {
		return "", ErrEmptyPath
	}
	for i := 0; i < maxUniquePathRetries; i++ {
		exist, err := PathExists(path)
		if err != nil {
			return "", err
		}
		if !exist {
			return path, nil
		}

		path = nextUniquePathCandidate(path)
	}
	return "", fmt.Errorf("failed to find unique path after %d attempts (last candidate: %q)", maxUniquePathRetries, path)
}

type UniquePathResolver struct {
	mu       sync.Mutex
	reserved map[string]struct{}
}

func NewUniquePathResolver() *UniquePathResolver {
	return &UniquePathResolver{
		reserved: make(map[string]struct{}),
	}
}

func (r *UniquePathResolver) UniquePath(path string) (string, error) {
	if path == "" {
		return "", ErrEmptyPath
	}
	if r == nil {
		return UniquePath(path)
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.reserved == nil {
		r.reserved = make(map[string]struct{})
	}

	for i := 0; i < maxUniquePathRetries; i++ {
		key := uniquePathReservationKey(path)
		if _, exists := r.reserved[key]; exists {
			path = nextUniquePathCandidate(path)
			continue
		}

		exist, err := PathExists(path)
		if err != nil {
			return "", err
		}
		if !exist {
			r.reserved[key] = struct{}{}
			return path, nil
		}

		path = nextUniquePathCandidate(path)
	}
	return "", fmt.Errorf("failed to find unique path after %d attempts (last candidate: %q)", maxUniquePathRetries, path)
}

func uniquePathReservationKey(path string) string {
	key, err := filepath.Abs(path)
	if err != nil {
		key = filepath.Clean(path)
	}
	if runtime.GOOS == "windows" {
		key = strings.ToLower(key)
	}
	return key
}

func nextUniquePathCandidate(path string) string {
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	if ext == base {
		ext = ""
	}
	stem, _ := strings.CutSuffix(base, ext)
	stemlen := len(stem)

	// 处理已括号结尾的文件名
	if stemlen > 0 && stem[stemlen-1] == ')' {
		if left := strings.LastIndex(stem, "("); left != -1 {
			index, err := strconv.Atoi(stem[left+1 : stemlen-1])
			if err == nil && index < int(^uint(0)>>1) {
				index++
				stem = fmt.Sprintf("%s(%d)", stem[:left], index)
				return filepath.Join(dir, stem+ext)
			}
		}
	}

	return filepath.Join(dir, stem+"(1)"+ext)
}

func GetExtFromUrl(u string) (string, error) {
	pu, err := url.Parse(u)
	if err != nil {
		return "", err
	}
	// 使用 path.Ext 而不是 filepath.Ext，因为 URL path 总是使用正斜杠
	// filepath.Ext 在 Windows 上会使用反斜杠作为分隔符，导致无法正确提取扩展名
	return path.Ext(pu.Path), nil
}
