package naming

import (
	"fmt"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/unkmonster/tmd/internal/utils"
)

// TweetNaming builds stable tweet media names and their human-readable log label.
type TweetNaming struct {
	sanitized string
	tweetID   uint64
	creator   string
	maxLen    int
}

func NewTweetNaming(text string, tweetID uint64, creator string, maxLen int) *TweetNaming {
	return &TweetNaming{
		sanitized: sanitizeNamePart(text, maxLen),
		tweetID:   tweetID,
		creator:   normalizeLogLabel(creator, maxLen),
		maxLen:    maxLen,
	}
}

func (tn *TweetNaming) textPart() string {
	idPart := fmt.Sprintf("_%d", tn.tweetID)
	maxTextLen := tn.maxLen - len(idPart) - ExtReserveLen
	if maxTextLen < 0 {
		maxTextLen = 0
	}

	text := tn.sanitized
	text = truncateUTF8(text, maxTextLen)
	if text == "" {
		text = "tweet"
	}

	return text
}

func (tn *TweetNaming) baseName() string {
	return tn.textPart() + fmt.Sprintf("_%d", tn.tweetID)
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
// extension budget.
func (tn *TweetNaming) FileName(ext string) string {
	return tn.baseName() + normalizeExtension(ext)
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
