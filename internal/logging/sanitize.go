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
	"unicode/utf8"
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
	bearerTokenRegex      = regexp.MustCompile(`(?i)\bBearer[ \t\r\n]+[^\s,;&"']+`)
	namedSecretRegex      = regexp.MustCompile(`(?i)(["']?)\b(` + sensitiveFieldPattern() + `)(["']?)([ \t]*[:=][ \t]*)(Bearer[ \t\r\n]+[^\s,;&"']+|Basic[ \t\r\n]+[^\s,;&"']+|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|[^,;&"'\n]+)`)
	absoluteURLRegex      = regexp.MustCompile(`(?i)\b[a-z][a-z0-9+.-]*://[^\s<>"']+`)
	rootlessUserinfoRegex = regexp.MustCompile(`\b[A-Za-z0-9._~%!$&'()*+,;=:/-]+:[^@\s,;&"'\]]*@[^\s,;&"']+`)
	maskedSecretRegex     = regexp.MustCompile(`^\[redacted:[0-9a-f]{8,64}\]$`)
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
			_, size := utf8.DecodeRuneInString(text[index:])
			if size <= 0 {
				size = 1
			}
			sanitized.WriteString(text[index : index+size])
			index += size
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
	text = absoluteURLRegex.ReplaceAllStringFunc(text, SanitizeURL)
	// 无 scheme 的 user:pass@host 形态（url.Parse 按 scheme:opaque 解析、
	// User 恒为 nil），在自由文本与 query 值中按凭据掩码。
	text = rootlessUserinfoRegex.ReplaceAllStringFunc(text, func(match string) string {
		at := strings.LastIndex(match, "@")
		if at <= 0 {
			return match
		}
		// 带 scheme 的 URL 已由上面的 absoluteURLRegex→SanitizeURL 处理过，其
		// userinfo 掩码是百分号编码的（%5Bredacted%3A…%5D），仍会被本正则命中；
		// 再掩一次会把 scheme 与字段名一起吞进指纹、且同一凭据出现两种指纹。
		if strings.Contains(match[:at], "://") {
			return match
		}
		// 已掩码的指纹（[redacted:...] 去括号形态）保持原样，保证幂等。
		if maskedSecretRegex.MatchString("[" + match[:at] + "]") {
			return match
		}
		return MaskSecret(match[:at]) + match[at:]
	})
	text = namedSecretRegex.ReplaceAllStringFunc(text, func(match string) string {
		parts := namedSecretRegex.FindStringSubmatch(match)
		if len(parts) != 6 || !isSensitiveFieldName(parts[2]) {
			return match
		}
		return parts[1] + parts[2] + parts[3] + parts[4] + maskCredential(parts[5])
	})
	return bearerTokenRegex.ReplaceAllStringFunc(text, func(match string) string {
		separator := strings.IndexAny(match, " \t\r\n")
		if separator < 0 {
			return match
		}
		return match[:separator] + " " + MaskSecret(strings.TrimSpace(match[separator+1:]))
	})
}

func maskCredential(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
		quote := value[:1]
		return quote + maskCredential(value[1:len(value)-1]) + quote
	}

	for _, scheme := range []string{"Bearer", "Basic"} {
		if len(value) > len(scheme) && strings.EqualFold(value[:len(scheme)], scheme) && (value[len(scheme)] == ' ' || value[len(scheme)] == '\t' || value[len(scheme)] == '\r' || value[len(scheme)] == '\n') {
			return scheme + " " + MaskSecret(strings.TrimSpace(value[len(scheme)+1:]))
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
	text = RedactSensitiveText(StripANSI(text))
	return strings.Map(func(value rune) rune {
		if value == '\n' || value == '\t' || !unicode.IsControl(value) {
			return value
		}
		return -1
	}, text)
}

// telegramBotPathTokenRe 匹配 Telegram Bot API URL path 中的令牌
// （https://api.telegram.org/bot<id>:<secret>/... 与 /file/bot<id>:<secret>/...）。
// Telegram SDK 把 token 直接拼进 path，传输层失败时 *url.Error 会携带完整
// URL；SanitizeURL 只处理 userinfo/query/fragment，必须在此显式掩码 path。
var telegramBotPathTokenRe = regexp.MustCompile(`(?i)(/(?:file/)?bot)([0-9]{4,}:[A-Za-z0-9_-]+)`)

// SanitizeURL redacts sensitive URL user information, query values, fragments,
// and path-embedded credentials (Telegram bot tokens).
func SanitizeURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return url.Values{"invalid-url": {MaskSecret(raw)}}.Encode()
	}
	if telegramBotPathTokenRe.MatchString(u.Path) {
		u.Path = telegramBotPathTokenRe.ReplaceAllStringFunc(u.Path, func(match string) string {
			parts := telegramBotPathTokenRe.FindStringSubmatch(match)
			if len(parts) != 3 {
				return match
			}
			// 保留前缀（/bot 或 /file/bot），仅掩码令牌本体，便于日志定位。
			return parts[1] + MaskSecret(parts[2])
		})
	}
	if u.User != nil {
		u.User = url.User(MaskSecret(u.User.String()))
	} else if u.Opaque != "" {
		// scheme:opaque 形态（如 "user:pass@host" 被 url.Parse 解析为
		// scheme=user、opaque=pass@host，User 恒为 nil）不会经过上面的
		// userinfo 掩码。按最后一个 @ 手工掩码凭据部分（连同 scheme，
		// 该形态在日志中几乎总是配置错误的值而非真实 URL），防止无
		// scheme 的 user:pass@host 原样进入日志。直接返回掩码串而不
		// 走 String()，避免掩码后的 scheme 含特殊字符无法再次解析。
		if at := strings.LastIndex(u.Opaque, "@"); at >= 0 {
			return MaskSecret(u.Scheme+":"+u.Opaque[:at]) + u.Opaque[at:]
		}
	}

	query, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		u.RawQuery = url.Values{"malformed_query": {MaskSecret(u.RawQuery)}}.Encode()
		if u.Fragment != "" {
			u.Fragment = RedactSensitiveText(u.Fragment)
		}
		return u.String()
	}
	queryChanged := false
	for key, values := range query {
		// ParseQuery 对 "token%3DSECRET123"（编码的 =）返回 key="token=SECRET123"、
		// value 为空——键本身携带敏感字段名与值，拆开后再按字段名掩码，
		// 否则该形态的凭据会原样进入日志。
		if before, after, found := strings.Cut(key, "="); found && isSensitiveFieldName(before) {
			maskedKey := before + "=" + MaskSecret(after)
			if maskedKey != key {
				delete(query, key)
				query[maskedKey] = values
				queryChanged = true
			}
			continue
		}
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
