package naming

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
		title = truncateUTF8(title, maxLen)
	} else {
		suffix := parenthesizedIdentity(screenName, maxLen)
		title = fitNameWithSuffix(name, suffix, maxLen)
	}
	title = finalizeName(title, maxLen)
	if title == "" && maxLen > 0 {
		title = truncateUTF8("user", maxLen)
	}

	return &UserNaming{
		sanitized: title,
	}
}

// SanitizedTitle returns the Windows-compatible user directory component.
func (un *UserNaming) SanitizedTitle() string {
	return un.sanitized
}
