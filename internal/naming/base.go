package naming

import (
	"strings"
	"unicode"

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

// legacyTweetPart retains the pre-hardening tweet-text transformation for
// compatibility lookup only. New media names must continue to use
// sanitizeTweetPart.
func legacyTweetPart(value string, maxLen int) string {
	return utils.WinFileNameWithMaxLenLegacy(value, maxLen)
}

func finalizeName(value string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	return strings.TrimSpace(utils.WinFileNameWithMaxLen(value, maxLen))
}

// finalizeOrFallback 把已拼接的标题做最后清洗，并在清洗结果为空时
// 回退到领域默认值（user/list）。UserNaming 与 ListNaming 共用，
// 避免两处各写一遍「清洗 → 判空 → 兜底 → 截断」。
func finalizeOrFallback(value, fallback string, maxLen int) string {
	title := finalizeName(value, maxLen)
	if title == "" && maxLen > 0 {
		title = utils.TruncateUTF8(fallback, maxLen)
	}
	return title
}

func fitNameWithSuffix(name, suffix string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	if len(suffix) >= maxLen {
		return utils.TruncateUTF8(suffix, maxLen)
	}
	return utils.TruncateUTF8(name, maxLen-len(suffix)) + suffix
}

func parenthesizedIdentity(identity string, maxLen int) string {
	if identity == "" || maxLen <= 0 {
		return ""
	}
	if maxLen < 3 {
		return utils.TruncateUTF8(identity, maxLen)
	}
	return "(" + utils.TruncateUTF8(identity, maxLen-2) + ")"
}

// normalizeExtension normalizes an extension into the reserved byte budget,
// stripping path separators and characters outside [alnum . - _]. Common media
// extensions (.jpg/.mp4/.gif/.webp/.m3u8) are unchanged, so already-downloaded
// files keep their names. Legacy URLs whose path extension contains other
// characters (for example ".../xyz.jpg:large") normalize differently from the
// baseline's raw concatenation; on Linux that re-downloads the media once and
// leaves the old file as an orphan (Windows could never create the old name,
// so it is unaffected). Interior dots are preserved.
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
	return utils.TruncateUTF8("."+core, ExtReserveLen)
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
		value = utils.TruncateUTF8(value, maxLen)
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
