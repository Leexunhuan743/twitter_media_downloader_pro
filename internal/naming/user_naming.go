package naming

import "github.com/unkmonster/tmd/internal/utils"

// UserNaming builds a directory title while preserving the stable screen name.
type UserNaming struct {
	sanitized string
}

// NewUserNaming preserves screenName as the stable suffix and spends any
// remaining byte budget on the display name.
func NewUserNaming(name, screenName string, maxLen int) *UserNaming {
	name = sanitizeNamePart(name, maxLen)
	screenName = sanitizeNamePart(screenName, maxLen)

	var title string
	if screenName == "" {
		title = name
		if title == "" {
			title = "user"
		}
		title = utils.TruncateUTF8(title, maxLen)
	} else {
		suffix := parenthesizedIdentity(screenName, maxLen)
		title = fitNameWithSuffix(name, suffix, maxLen)
	}
	title = finalizeName(title, maxLen)
	if title == "" && maxLen > 0 {
		title = utils.TruncateUTF8("user", maxLen)
	}

	return &UserNaming{
		sanitized: title,
	}
}

// SanitizedTitle returns the Windows-compatible user directory component.
func (un *UserNaming) SanitizedTitle() string {
	return un.sanitized
}

// UserDirTitle 返回用户目录名（Windows 兼容的清洗后标题），
// 等价于 NewUserNaming(name, screenName, maxLen).SanitizedTitle()，
// 供各下载入口（service/downloading/profile）统一复用，避免内联重复。
func UserDirTitle(name, screenName string, maxLen int) string {
	return NewUserNaming(name, screenName, maxLen).SanitizedTitle()
}
