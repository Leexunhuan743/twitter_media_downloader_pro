package logging

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMaskSecretDoesNotExposeOriginal(t *testing.T) {
	secret := "super-secret-token"
	masked := MaskSecret(secret)

	assert.NotEmpty(t, masked)
	assert.NotContains(t, masked, secret)
	assert.Contains(t, masked, "[redacted:")
}

func TestStripANSI(t *testing.T) {
	got := StripANSI("\x1b[95mtitle=\"hello\"\x1b[0m")

	assert.Equal(t, `title="hello"`, got)
}

func TestStripANSI_RemovesExtendedControlSequences(t *testing.T) {
	got := StripANSI("\x1b]8;;https://example.invalid\alink\x1b]8;;\a \x1b[?25lvisible\x1b[?25h")

	assert.Equal(t, "link visible", got)
}

func TestPathForLog(t *testing.T) {
	assert.Equal(t, "C:/Users/example/AppData/Roaming/.tmd2/bot_config.yaml", Path(`C:\Users\example\AppData\Roaming\.tmd2\bot_config.yaml`))
	assert.Equal(t, "/home/user/.tmd2/bot_config.yaml", Path("/home/user/.tmd2/bot_config.yaml"))
	assert.Equal(t, "F:/twitter dl/.data/foo.db", Path(`F:\twitter dl\.data\foo.db`))
}

func TestSanitizeURLRedactsSensitiveQueryParams(t *testing.T) {
	got := SanitizeURL("/api/v1/logs/stream?token=secret-token&q=download&api_key=abc123&client_secret=client-secret")

	assert.Contains(t, got, "q=download")
	assert.NotContains(t, got, "secret-token")
	assert.NotContains(t, got, "abc123")
	assert.NotContains(t, got, "client-secret")
	assert.Contains(t, got, "token=%5Bredacted")
	assert.Contains(t, got, "api_key=%5Bredacted")
}

func TestSanitizeURLRedactsUserInfoAndFragment(t *testing.T) {
	got := SanitizeURL("https://alice:password-secret@example.invalid/callback#access_token=fragment-secret&state=keep")

	assert.NotContains(t, got, "alice")
	assert.NotContains(t, got, "password-secret")
	assert.NotContains(t, got, "fragment-secret")
	assert.Contains(t, got, "state=keep")
	assert.Contains(t, got, "redacted")
}

func TestRequestTargetRedactsEventSourceToken(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/sse/tasks?token=jwt-secret&level=info", nil)

	got := RequestTarget(req)

	assert.Contains(t, got, "level=info")
	assert.NotContains(t, got, "jwt-secret")
	assert.Contains(t, got, "token=%5Bredacted")
}

func TestRedactSensitiveText(t *testing.T) {
	got := RedactSensitiveText(`Authorization=Bearer abc.def token=plain auth_token=cookie ct0=csrf`)

	assert.NotContains(t, got, "abc.def")
	assert.NotContains(t, got, "plain")
	assert.NotContains(t, got, "cookie")
	assert.NotContains(t, got, "csrf")
	assert.Contains(t, got, "Authorization=")
}

func TestRedactSensitiveTextHandlesHeadersAndJSON(t *testing.T) {
	got := RedactSensitiveText(`Bearer bare-secret Authorization: Basic basic-secret {"access_token":"json-secret","password":"password-secret","ok":"keep"} x-api-key=key-secret`)

	for _, secret := range []string{"bare-secret", "basic-secret", "json-secret", "password-secret", "key-secret"} {
		assert.NotContains(t, got, secret)
	}
	assert.Contains(t, got, `"ok":"keep"`)
}

func TestRedactSensitiveTextUsesSecretFingerprintAndIsIdempotent(t *testing.T) {
	first := RedactSensitiveText("Bearer first-secret")
	second := RedactSensitiveText("Bearer second-secret")
	quoted := RedactSensitiveText(`{"Authorization":"Bearer quoted-secret"}`)

	assert.NotEqual(t, first, second)
	assert.Equal(t, first, RedactSensitiveText(first))
	assert.NotContains(t, quoted, "quoted-secret")
	assert.Equal(t, quoted, RedactSensitiveText(quoted))
	assert.Contains(t, quoted, `"}`)
}

func TestRedactSensitiveTextDoesNotMatchFieldSuffixes(t *testing.T) {
	input := `not_token=public token_count=3 authentication=enabled`

	assert.Equal(t, input, RedactSensitiveText(input))
}

func TestSanitizeLogText(t *testing.T) {
	got := SanitizeLogText("\x1b]8;;https://example.invalid\asecret\x1b]8;;\a token=plain-secret\r\x00\x07")

	assert.NotContains(t, got, "\x1b")
	assert.NotContains(t, got, "plain-secret")
	assert.NotContains(t, got, "\r")
	assert.NotContains(t, got, "\x00")
	assert.NotContains(t, got, "\x07")
	assert.Contains(t, got, "secret")
}

func TestSanitizeHeadersRedactsCredentials(t *testing.T) {
	h := http.Header{}
	h.Set("Authorization", "Bearer secret-bearer")
	h.Set("Cookie", "auth_token=secret-cookie; ct0=secret-ct0")
	h.Set("X-Csrf-Token", "secret-csrf")
	h.Set("X-Request-Id", "keep-me")

	got := SanitizeHeaders(h)

	// 敏感头脱敏为指纹，不含明文
	assert.NotContains(t, got.Get("Authorization"), "secret-bearer")
	assert.NotContains(t, got.Get("Cookie"), "secret-cookie")
	assert.NotContains(t, got.Get("Cookie"), "secret-ct0")
	assert.NotContains(t, got.Get("X-Csrf-Token"), "secret-csrf")
	assert.Contains(t, got.Get("Authorization"), "[redacted:")
	// 非敏感头保持原样
	assert.Equal(t, "keep-me", got.Get("X-Request-Id"))
	// 原始 header 不被修改（返回副本）
	assert.Equal(t, "Bearer secret-bearer", h.Get("Authorization"))
}

func TestSanitizeHeadersHandlesNonCanonicalSensitiveNames(t *testing.T) {
	h := http.Header{
		"authorization": {"Bearer lower-secret"},
		"x-api-key":     {"api-secret"},
	}

	got := SanitizeHeaders(h)
	gotText := fmt.Sprint(got)

	assert.NotContains(t, gotText, "lower-secret")
	assert.NotContains(t, gotText, "api-secret")
	assert.Equal(t, "Bearer lower-secret", h["authorization"][0])
	assert.Equal(t, "api-secret", h["x-api-key"][0])
}
