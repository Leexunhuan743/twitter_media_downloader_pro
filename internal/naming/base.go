package naming

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/unkmonster/tmd/internal/utils"
)

// ExtReserveLen is the maximum UTF-8 byte budget for a normalized extension.
const ExtReserveLen = 8

func sanitizeNamePart(value string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}

	// Prefixing prevents a valid segment such as CON from being treated as a
	// reserved full filename before the domain suffix is added.
	sanitized := utils.WinFileNameWithMaxLen("x"+value, maxLen+1)
	sanitized = strings.TrimPrefix(sanitized, "x")
	return strings.TrimSpace(sanitized)
}

// sanitizeTweetPart sanitizes tweet text while preserving trailing spaces and
// dots that older versions wrote into already-downloaded filenames. Renaming
// those files on upgrade would re-download every affected tweet.
func sanitizeTweetPart(value string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	return strings.TrimPrefix(utils.WinFileNameWithMaxLenStable("x"+value, maxLen+1), "x")
}

func finalizeName(value string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	return strings.TrimSpace(utils.WinFileNameWithMaxLen(value, maxLen))
}

func truncateUTF8(value string, maxLen int) string {
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

func fitNameWithSuffix(name, suffix string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	if len(suffix) >= maxLen {
		return truncateUTF8(suffix, maxLen)
	}
	return truncateUTF8(name, maxLen-len(suffix)) + suffix
}

func parenthesizedIdentity(identity string, maxLen int) string {
	if identity == "" || maxLen <= 0 {
		return ""
	}
	if maxLen < 3 {
		return truncateUTF8(identity, maxLen)
	}
	return "(" + truncateUTF8(identity, maxLen-2) + ")"
}

func normalizeExtension(ext string) string {
	ext = strings.TrimSpace(ext)
	if index := strings.LastIndexAny(ext, `/\`); index >= 0 {
		ext = ext[index+1:]
	}

	var normalized strings.Builder
	for _, ch := range ext {
		if unicode.IsLetter(ch) || unicode.IsNumber(ch) || ch == '.' || ch == '-' || ch == '_' {
			normalized.WriteRune(ch)
		}
	}
	core := strings.Trim(normalized.String(), " .")
	if core == "" {
		return ""
	}
	return truncateUTF8("."+core, ExtReserveLen)
}

func normalizeLogLabel(value string, maxLen int) string {
	value = strings.Map(func(ch rune) rune {
		if unicode.IsControl(ch) {
			return ' '
		}
		return ch
	}, value)
	value = strings.Join(strings.Fields(value), " ")
	if value == "" {
		value = "unknown"
	}
	if maxLen > 0 {
		value = truncateUTF8(value, maxLen)
	}
	return value
}

// guardReservedFileName prefixes a file name that is exactly a Windows reserved
// device name (for example CON, CON.txt, COM1). Tweet media names always carry
// the tweet-id suffix, so this is defense in depth rather than a rename vector.
func guardReservedFileName(name string) string {
	if utils.IsWindowsReservedFileName(name) {
		return "_" + name
	}
	return name
}
