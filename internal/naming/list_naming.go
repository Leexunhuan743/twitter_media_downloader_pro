package naming

import (
	"fmt"
	"reflect"
	"strings"

	"github.com/unkmonster/tmd/internal/utils"
)

// ListNamer supplies the identity and display title needed for list naming.
type ListNamer interface {
	GetId() int64
	Title() string
}

// ListNaming stores a Windows-compatible list directory title.
type ListNaming struct {
	sanitized string
}

// NewListNamingFromBase preserves an existing numeric ID suffix and provides a
// deterministic fallback when the source title is empty or unavailable.
func NewListNamingFromBase(lst ListNamer, maxLen int) *ListNaming {
	if isNilListNamer(lst) {
		return &ListNaming{sanitized: finalizeName("list", maxLen)}
	}

	id := lst.GetId()
	rawTitle := strings.TrimSpace(lst.Title())
	idSuffix := fmt.Sprintf("(%d)", id)

	var title string
	if strings.HasSuffix(rawTitle, idSuffix) {
		name := sanitizeNamePart(strings.TrimSuffix(rawTitle, idSuffix), maxLen)
		if name == "" {
			name = "list"
		}
		title = fitNameWithSuffix(name, idSuffix, maxLen)
	} else {
		title = sanitizeNamePart(rawTitle, maxLen)
		if title == "" {
			title = "list"
			if id != 0 {
				title = fitNameWithSuffix(title, idSuffix, maxLen)
			}
		} else {
			title = utils.TruncateUTF8(title, maxLen)
		}
	}
	title = finalizeName(title, maxLen)
	if title == "" && maxLen > 0 {
		title = utils.TruncateUTF8("list", maxLen)
	}

	return &ListNaming{
		sanitized: title,
	}
}

// SanitizedTitle returns the Windows-compatible list directory component.
func (ln *ListNaming) SanitizedTitle() string {
	return ln.sanitized
}

func isNilListNamer(lst ListNamer) bool {
	if lst == nil {
		return true
	}
	value := reflect.ValueOf(lst)
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}
