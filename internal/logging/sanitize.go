package logging

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	ansiRegex            = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	bearerTokenRegex     = regexp.MustCompile(`(?i)\bBearer\s+[^\s]+`)
	keyValueSecretRegex  = regexp.MustCompile(`(?i)\b(auth_token|ct0|api_key|access_token|refresh_token|token|jwt|authorization)=([^\s&]+)`)
	sensitiveQueryFields = map[string]struct{}{
		"access_token":  {},
		"api_key":       {},
		"auth_token":    {},
		"authorization": {},
		"ct0":           {},
		"jwt":           {},
		"refresh_token": {},
		"token":         {},
	}
)

// StripANSI removes terminal color escape sequences from text.
func StripANSI(text string) string {
	return ansiRegex.ReplaceAllString(text, "")
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
	sum := sha256.Sum256([]byte(value))
	return fmt.Sprintf("[redacted:%x]", sum[:4])
}

// RedactSensitiveText removes common credential forms from free-form text.
func RedactSensitiveText(text string) string {
	text = bearerTokenRegex.ReplaceAllString(text, "Bearer "+MaskSecret("bearer"))
	return keyValueSecretRegex.ReplaceAllStringFunc(text, func(match string) string {
		parts := strings.SplitN(match, "=", 2)
		if len(parts) != 2 {
			return match
		}
		return parts[0] + "=" + MaskSecret(parts[1])
	})
}

// SanitizeURL redacts sensitive query parameters while preserving the rest.
func SanitizeURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return RedactSensitiveText(raw)
	}
	q := u.Query()
	for key, values := range q {
		if _, ok := sensitiveQueryFields[strings.ToLower(key)]; !ok {
			continue
		}
		for i, value := range values {
			values[i] = MaskSecret(value)
		}
		q[key] = values
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// RequestTarget returns a log-safe HTTP request target.
func RequestTarget(r *http.Request) string {
	if r == nil || r.URL == nil {
		return ""
	}
	return SanitizeURL(r.URL.RequestURI())
}

// sensitiveHeaderNames 是日志输出时需要脱敏的 HTTP 头。
// Cookie/Set-Cookie 可能携带 auth_token、ct0；Authorization/Proxy-Authorization
// 携带 Bearer 凭据；X-Csrf-Token 是 Twitter 会话防跨站令牌。
var sensitiveHeaderNames = map[string]struct{}{
	"Authorization":      {},
	"Proxy-Authorization": {},
	"Cookie":             {},
	"Set-Cookie":         {},
	"X-Csrf-Token":       {},
}

// SanitizeHeaders 返回脱敏后的 header 副本：敏感头的值整体替换为稳定指纹。
// 用于 resty 的 OnRequestLog/OnResponseLog 回调，在 debug 全量日志输出前过滤凭据。
func SanitizeHeaders(h http.Header) http.Header {
	if h == nil {
		return nil
	}
	out := h.Clone()
	for name := range out {
		if _, ok := sensitiveHeaderNames[http.CanonicalHeaderKey(name)]; !ok {
			continue
		}
		values := out.Values(name)
		for i := range values {
			values[i] = MaskSecret(values[i])
		}
		out[name] = values
	}
	return out
}
