package naming

import (
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"unicode"

	"github.com/unkmonster/tmd/internal/utils"
)

// TweetNaming builds stable tweet media names and their human-readable log label.
type TweetNaming struct {
	sanitized           string
	historicalSanitized string
	legacySanitized     string
	tweetID             uint64
	creator             string
	maxLen              int
}

func NewTweetNaming(text string, tweetID uint64, creator string, maxLen int) *TweetNaming {
	return &TweetNaming{
		sanitized:           sanitizeTweetPart(text, maxLen),
		historicalSanitized: sanitizeNamePart(text, maxLen),
		legacySanitized:     legacyTweetPart(text, maxLen),
		tweetID:             tweetID,
		creator:             normalizeLogLabel(creator, maxLen),
		maxLen:              maxLen,
	}
}

func (tn *TweetNaming) textPart() string {
	return tn.textPartFor(tn.sanitized)
}

func (tn *TweetNaming) textPartFor(sanitized string) string {
	idPart := fmt.Sprintf("_%d", tn.tweetID)
	maxTextLen := tn.maxLen - len(idPart) - ExtReserveLen
	if maxTextLen < 0 {
		maxTextLen = 0
	}

	text := sanitized
	text = utils.TruncateUTF8(text, maxTextLen)
	if text == "" {
		text = "tweet"
	}

	return text
}

func (tn *TweetNaming) baseName() string {
	return tn.baseNameFor(tn.sanitized)
}

func (tn *TweetNaming) baseNameFor(sanitized string) string {
	return tn.textPartFor(sanitized) + fmt.Sprintf("_%d", tn.tweetID)
}

func (tn *TweetNaming) logBaseName() string {
	text := strings.TrimRightFunc(tn.textPart(), unicode.IsSpace)
	if text == "" {
		text = "tweet"
	}
	return text + fmt.Sprintf(" _%d", tn.tweetID)
}

func (tn *TweetNaming) LogFormat() string {
	return fmt.Sprintf("[%s] %s", tn.creator, tn.logBaseName())
}

// FileName returns a filename whose extension is normalized into the reserved
// extension budget. The final name is re-checked for Windows reserved device
// names so a future caller that drops the tweet-id suffix cannot produce an
// uncreatable file.
func (tn *TweetNaming) FileName(ext string) string {
	return guardReservedFileName(tn.baseName() + normalizeExtension(ext))
}

// LegacyFileNames returns safe filenames produced by superseded tweet naming
// rules. It is deliberately for read-only compatibility lookup: callers must
// never choose one of these names for a new write.
func (tn *TweetNaming) LegacyFileNames(ext string) []string {
	return tn.legacyFileNamesForPlatform(ext, runtime.GOOS == "windows")
}

func (tn *TweetNaming) legacyFileNamesForPlatform(ext string, windows bool) []string {
	appendUnique := func(names []string, name string) []string {
		if name == "" {
			return names
		}
		for _, existing := range names {
			if existing == name {
				return names
			}
		}
		return append(names, name)
	}

	names := make([]string, 0, 5)
	// The immediately previous selection may use a different but otherwise
	// normalized extension (for example .m3u8 instead of the current .mp4).
	names = appendUnique(names, guardReservedFileName(tn.baseName()+normalizeExtension(ext)))
	// 14c..d6ef normalized extensions but used the stricter historical text
	// sanitizer, so a title with leading/trailing characters can differ.
	names = appendUnique(names, guardReservedFileName(tn.baseNameFor(tn.historicalSanitized)+normalizeExtension(ext)))
	// Files written under the deprecated deletion rule (".jpg:large" stored as
	// ".jpglarg") stay readable through these candidates.
	names = appendUnique(names, guardReservedFileName(tn.baseName()+legacyNormalizeExtension(ext)))
	names = appendUnique(names, guardReservedFileName(tn.baseNameFor(tn.historicalSanitized)+legacyNormalizeExtension(ext)))
	// Before extension hardening, POSIX installations could write raw extension
	// suffixes and control characters. Windows cannot address those filenames.
	if !windows {
		raw := tn.baseNameFor(tn.legacySanitized) + ext
		if legacyFileNameIsSafeComponent(raw) {
			names = appendUnique(names, raw)
		}
	}
	return names
}

func legacyFileNameIsSafeComponent(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	return !strings.ContainsRune(name, 0) &&
		!strings.ContainsAny(name, `/\\`) &&
		filepath.Base(name) == name
}

// FilePath returns a collision-free path based on the current filesystem.
func (tn *TweetNaming) FilePath(dir string, ext string) (string, error) {
	fullPath := filepath.Join(dir, tn.FileName(ext))
	return utils.UniquePath(fullPath)
}

// FilePathWithResolver returns a collision-free path and reserves it in resolver.
func (tn *TweetNaming) FilePathWithResolver(dir string, ext string, resolver *utils.UniquePathResolver) (string, error) {
	fullPath := filepath.Join(dir, tn.FileName(ext))
	return resolver.UniquePath(fullPath)
}
