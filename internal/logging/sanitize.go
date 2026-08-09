package logging

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

var (
	sensitiveFieldNames = map[string]struct{}{
		"access_token":        {},
		"api_key":             {},
		"apikey":              {},
		"auth":                {},
		"auth_token":          {},
		"authorization":       {},
		"client_secret":       {},
		"cookie":              {},
		"credential":          {},
		"credentials":         {},
		"csrf":                {},
		"csrf_token":          {},
		"ct0":                 {},
		"jwt":                 {},
		"password":            {},
		"passwd":              {},
		"proxy_authorization": {},
		"refresh_token":       {},
		"secret":              {},
		"session":             {},
		"session_id":          {},
		"session_token":       {},
		"set_cookie":          {},
		"token":               {},
		"x_api_key":           {},
		"x_auth_token":        {},
		"x_csrf_token":        {},
		"x_xsrf_token":        {},
		"xsrf_token":          {},
	}
	bearerTokenRegex  = regexp.MustCompile(`(?i)\bBearer[ \t]+[^\s,;&"']+`)
	namedSecretRegex  = regexp.MustCompile(`(?i)(["']?)\b(` + sensitiveFieldPattern() + `)(["']?)([ \t]*[:=][ \t]*)(Bearer[ \t]+[^\s,;&"']+|Basic[ \t]+[^\s,;&"']+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&"']+)`)
	maskedSecretRegex = regexp.MustCompile(`^\[redacted:[0-9a-f]{8,64}\]$`)
)

func sensitiveFieldPattern() string {
	names := make([]string, 0, len(sensitiveFieldNames))
	for name := range sensitiveFieldNames {
		name = regexp.QuoteMeta(name)
		names = append(names, strings.ReplaceAll(name, "_", `[_-]`))
	}
	sort.Strings(names)
	return strings.Join(names, "|")
}

// StripANSI removes CSI, OSC, and other ANSI escape sequences from text.
func StripANSI(text string) string {
	var sanitized strings.Builder
	sanitized.Grow(len(text))

	for index := 0; index < len(text); {
		switch text[index] {
		case '\x1b':
			index = skipANSIEscape(text, index)
		case '\x90', '\x98', '\x9d', '\x9e', '\x9f':
			index = skipANSIString(text, index+1)
		case '\x9b':
			index = skipANSIControlSequence(text, index+1)
		default:
			sanitized.WriteByte(text[index])
			index++
		}
	}

	return sanitized.String()
}

func skipANSIEscape(text string, index int) int {
	if index+1 >= len(text) {
		return len(text)
	}

	switch text[index+1] {
	case '[':
		return skipANSIControlSequence(text, index+2)
	case ']', 'P', 'X', '^', '_':
		return skipANSIString(text, index+2)
	}

	cursor := index + 1
	for cursor < len(text) && text[cursor] >= 0x20 && text[cursor] <= 0x2f {
		cursor++
	}
	if cursor < len(text) && text[cursor] >= 0x30 && text[cursor] <= 0x7e {
		return cursor + 1
	}
	return cursor
}

func skipANSIControlSequence(text string, index int) int {
	for index < len(text) {
		value := text[index]
		if value >= 0x40 && value <= 0x7e {
			return index + 1
		}
		if value < 0x20 || value > 0x3f {
			return index
		}
		index++
	}
	return len(text)
}

func skipANSIString(text string, index int) int {
	for index < len(text) {
		switch text[index] {
		case '\a', '\x9c':
			return index + 1
		case '\x1b':
			if index+1 < len(text) && text[index+1] == '\\' {
				return index + 2
			}
		}
		index++
	}
	return len(text)
}

// Path returns a platform-neutral path string for human-readable logs.
func Path(value string) string {
	return strings.ReplaceAll(filepath.ToSlash(value), `\`, `/`)
}

// MaskSecret replaces a sensitive value with a stable short fingerprint.
func MaskSecret(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if maskedSecretRegex.MatchString(value) {
		return value
	}
	sum := sha256.Sum256([]byte(value))
	return fmt.Sprintf("[redacted:%x]", sum[:8])
}

// RedactSensitiveText removes common credential forms from free-form text.
func RedactSensitiveText(text string) string {
	text = namedSecretRegex.ReplaceAllStringFunc(text, func(match string) string {
		parts := namedSecretRegex.FindStringSubmatch(match)
		if len(parts) != 6 || !isSensitiveFieldName(parts[2]) {
			return match
		}
		return parts[1] + parts[2] + parts[3] + parts[4] + maskCredential(parts[5])
	})
	return bearerTokenRegex.ReplaceAllStringFunc(text, func(match string) string {
		separator := strings.IndexAny(match, " \t")
		if separator < 0 {
			return match
		}
		return match[:separator] + " " + MaskSecret(match[separator+1:])
	})
}

func maskCredential(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
		quote := value[:1]
		return quote + maskCredential(value[1:len(value)-1]) + quote
	}

	for _, scheme := range []string{"Bearer", "Basic"} {
		if len(value) > len(scheme) && strings.EqualFold(value[:len(scheme)], scheme) && (value[len(scheme)] == ' ' || value[len(scheme)] == '\t') {
			return scheme + " " + MaskSecret(value[len(scheme)+1:])
		}
	}
	return MaskSecret(value)
}

func isSensitiveFieldName(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, "-", "_")
	_, ok := sensitiveFieldNames[name]
	return ok
}

// SanitizeLogText removes terminal control sequences and redacts credentials
// while preserving line breaks used by multiline logs.
func SanitizeLogText(text string) string {
	text = StripANSI(RedactSensitiveText(text))
	return strings.Map(func(value rune) rune {
		if value == '\n' || value == '\t' || !unicode.IsControl(value) {
			return value
		}
		return -1
	}, text)
}

// SanitizeURL redacts sensitive URL user information, query values, and fragments.
func SanitizeURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return SanitizeLogText(raw)
	}
	if u.User != nil {
		u.User = url.User(MaskSecret(u.User.String()))
	}

	query := u.Query()
	queryChanged := false
	for key, values := range query {
		for index, value := range values {
			redacted := RedactSensitiveText(value)
			if isSensitiveFieldName(key) {
				redacted = MaskSecret(value)
			}
			if redacted != value {
				values[index] = redacted
				queryChanged = true
			}
		}
		query[key] = values
	}
	if queryChanged {
		u.RawQuery = query.Encode()
	}
	if u.Fragment != "" {
		u.Fragment = RedactSensitiveText(u.Fragment)
	}
	return u.String()
}

// RequestTarget returns a log-safe HTTP request target.
func RequestTarget(r *http.Request) string {
	if r == nil || r.URL == nil {
		return ""
	}
	return SanitizeURL(r.URL.RequestURI())
}

// SanitizeHeaders returns a cloned header map with sensitive values replaced
// by stable fingerprints, regardless of header-name casing.
func SanitizeHeaders(header http.Header) http.Header {
	if header == nil {
		return nil
	}
	out := header.Clone()
	for name, values := range out {
		if !isSensitiveFieldName(http.CanonicalHeaderKey(name)) {
			continue
		}
		redacted := make([]string, len(values))
		for index, value := range values {
			redacted[index] = MaskSecret(value)
		}
		out[name] = redacted
	}
	return out
}
