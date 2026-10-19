package naming

import (
	"strings"
	"testing"

	"github.com/unkmonster/tmd/internal/utils"
)

// 这些测试把「清洗后的名字必须是安全的单段路径组件」固定下来：
// 不含路径分隔符、NUL、控制字符，不是 Windows 保留设备名，
// 且在 maxLen > 0 时不超过字节预算。此前只在临时脚本里验证过。
var unsafeNameInputs = []string{
	"", " ", "..", "CON", "con.txt", "aux", "LPT9", "COM1.txt",
	"a/b", "a\\b", "a:b", "a*b", "a?b", "a|b", "a<b>c",
	"a\x00b", "a\x01b", "a\tb", "a\nb",
	"https://example.com/xyz.jpg:large", "...", ". .", "x ", " x",
	strings.Repeat("长a", 120),
}

var unsafeNameExts = []string{
	".jpg", "jpg", "", ".", "..", ".JPEG", "/x/y.png", "?a=1",
	".m3u8?tag=1", ".tar.gz", "\x00jpg", ".mp4",
}

func requireSafeComponent(t *testing.T, label, name string, maxLen int) {
	t.Helper()
	if strings.ContainsAny(name, "/\\") || strings.ContainsRune(name, 0) {
		t.Fatalf("%s %q contains path separator or NUL", label, name)
	}
	// 只禁止 Windows 文件名真正不允许的 C0 控制符与 DEL；C1（U+0080–U+009F）
	// 是合法文件名字符，清洗器保留它们，禁止会与实现分叉并让 fuzz 目标恒失败。
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			t.Fatalf("%s %q contains control rune %U", label, name, r)
		}
	}
	if utils.IsWindowsReservedFileName(name) {
		t.Fatalf("%s %q is a reserved Windows device name", label, name)
	}
	if maxLen > 0 && len(name) > maxLen {
		t.Fatalf("%s %q exceeds maxLen %d", label, name, maxLen)
	}
}

func TestUserAndListTitlesAreSafeComponents(t *testing.T) {
	for _, maxLen := range []int{1, 2, 6, 10, 20, 100} {
		for _, input := range unsafeNameInputs {
			requireSafeComponent(t, "UserDirTitle", UserDirTitle(input, input, maxLen), maxLen)
			requireSafeComponent(t, "UserDirTitle(screen only)", UserDirTitle("", input, maxLen), maxLen)
			requireSafeComponent(t, "NewListNamingFromBase", NewListNamingFromBase(fakeListNamer{id: 42, title: input}, maxLen).SanitizedTitle(), maxLen)
		}
	}
}

// tweetLengthBudget 只在配置可达的文件名预算内校验长度。
// 推文文件名必须带 _<tweetID> 后缀才能稳定去重与兼容旧文件，
// 预算小于该后缀时长度与唯一性无法同时满足；生产配置由
// config.MinFileNameLen=50 兜底，因此 50 以下只校验安全性。
func tweetLengthBudget(maxLen int) int {
	if maxLen < 50 {
		return 0
	}
	return maxLen
}

func TestTweetFileNamesAreSafeComponents(t *testing.T) {
	for _, maxLen := range []int{1, 2, 6, 10, 20, 100} {
		for _, input := range unsafeNameInputs {
			tn := NewTweetNaming(input, 1234567890123456789, input, maxLen)
			for _, ext := range unsafeNameExts {
				requireSafeComponent(t, "FileName", tn.FileName(ext), tweetLengthBudget(maxLen))
			}
			for _, name := range tn.LegacyFileNames(".jpg") {
				if name == "" || name == "." || name == ".." {
					t.Fatalf("legacy name %q from %q is not a usable component", name, input)
				}
				if strings.ContainsAny(name, "/\\") || strings.ContainsRune(name, 0) {
					t.Fatalf("legacy name %q from %q contains path separator or NUL", name, input)
				}
			}
		}
	}
}

func TestMaxLenNonPositiveYieldsEmptyTitles(t *testing.T) {
	for _, maxLen := range []int{0, -1} {
		if got := UserDirTitle("name", "screen", maxLen); got != "" {
			t.Fatalf("UserDirTitle maxLen=%d = %q, want empty", maxLen, got)
		}
		if got := NewListNamingFromBase(fakeListNamer{id: 1, title: "list"}, maxLen).SanitizedTitle(); got != "" {
			t.Fatalf("NewListNamingFromBase maxLen=%d = %q, want empty", maxLen, got)
		}
	}
}

func FuzzUserDirTitle(f *testing.F) {
	f.Add("Alice", "alice_01", 20)
	f.Add("..", "CON", 3)
	f.Add("长名字", "@handle", 1)
	f.Fuzz(func(t *testing.T, name, screenName string, maxLen int) {
		if maxLen < -2 || maxLen > 200 {
			maxLen = 200
		}
		requireSafeComponent(t, "UserDirTitle", UserDirTitle(name, screenName, maxLen), maxLen)
		requireSafeComponent(t, "NewListNamingFromBase", NewListNamingFromBase(fakeListNamer{id: 7, title: name + screenName}, maxLen).SanitizedTitle(), maxLen)
	})
}

func FuzzTweetFileName(f *testing.F) {
	f.Add("hello world", ".jpg", uint64(1), 20)
	f.Add("..", "", uint64(42), 4)
	f.Add("长文本", ".m3u8?tag=1", uint64(99), 1)
	f.Fuzz(func(t *testing.T, text, ext string, tweetID uint64, maxLen int) {
		if maxLen < 0 || maxLen > 200 {
			maxLen = 200
		}
		tn := NewTweetNaming(text, tweetID, text, maxLen)
		requireSafeComponent(t, "FileName", tn.FileName(ext), tweetLengthBudget(maxLen))
	})
}

type fakeListNamer struct {
	id    int64
	title string
}

func (f fakeListNamer) GetId() int64  { return f.id }
func (f fakeListNamer) Title() string { return f.title }
