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

func TestStripANSIPreservesUTF8Text(t *testing.T) {
	for _, input := range []string{
		"下载 鸟视频 完成",
		"downloaded Новая запись ok",
		"[task] Progress stage=downloading 用户名=测试用户",
		"emoji 🐦 remains visible",
		"日本語のログ",
	} {
		t.Run(input, func(t *testing.T) {
			assert.Equal(t, input, StripANSI(input))
		})
	}
}

func TestStripANSIRemovesC1AndStringTerminatedSequences(t *testing.T) {
	assert.Equal(t, "visible", StripANSI("\x9b31mvisible"))
	assert.Equal(t, "visible", StripANSI("\x9dhidden\x9cvisible"))
	assert.Equal(t, "visible", StripANSI("\x1bPhidden\x1b\\visible"))
	assert.Equal(t, "before", StripANSI("before\x1b]unterminated"))
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

func TestSanitizeURLFailsClosedForMalformedQuery(t *testing.T) {
	got := SanitizeURL("/api/v1/logs/stream?token=secret-token;level=debug")

	assert.Contains(t, got, "/api/v1/logs/stream")
	assert.Contains(t, got, "malformed_query=%5Bredacted")
	assert.NotContains(t, got, "secret-token")
}

func TestSanitizeURLFailsClosedForInvalidURL(t *testing.T) {
	got := SanitizeURL("http://%zz.example.invalid/?value=raw-secret")

	assert.Contains(t, got, "invalid-url=%5Bredacted")
	assert.NotContains(t, got, "raw-secret")
}

func TestSanitizeURLRedactsUserInfoAndFragment(t *testing.T) {
	got := SanitizeURL("https://alice:password-secret@example.invalid/callback#access_token=fragment-secret&state=keep")

	assert.NotContains(t, got, "alice")
	assert.NotContains(t, got, "password-secret")
	assert.NotContains(t, got, "fragment-secret")
	assert.Contains(t, got, "state=keep")
	assert.Contains(t, got, "redacted")
}

func TestSanitizeURLRedactsSchemeOpaqueUserInfo(t *testing.T) {
	// "user:pass@host" 无 scheme 前缀时被 url.Parse 解析为 scheme=user +
	// opaque=pass@host，User 恒为 nil——必须手工掩码 @ 前的凭据部分
	// （连同 scheme，该形态在日志中几乎总是配置错误的值），否则原样
	// 进入日志（corner 2）。
	got := SanitizeURL("user:pass@host")

	assert.NotContains(t, got, "pass")
	assert.Contains(t, got, "redacted")
	assert.Contains(t, got, "@host")

	// 幂等：掩码串经 RedactSensitiveText 二次处理稳定不变。
	assert.Equal(t, got, RedactSensitiveText(got))

	// 自由文本中的同类形态。
	gotText := RedactSensitiveText("oauth callback received redirect=user:pass@host for state=abc")
	assert.NotContains(t, gotText, "pass")
	assert.Contains(t, gotText, "redacted")
	assert.Contains(t, gotText, "@host")
	assert.Contains(t, gotText, "state=abc")

	// query 值中的同类形态（百分号编码后可还原）也必须被处理。
	gotQuery := SanitizeURL("https://example.invalid/cb?next=user:pass@host")
	assert.NotContains(t, gotQuery, "pass")
	assert.Contains(t, gotQuery, "redacted")
}

func TestRedactSensitiveTextValueBoundaries(t *testing.T) {
	// 值含空格到行尾：整体掩码，不允许残留 "secret value"。
	got := RedactSensitiveText("token=my secret value")
	assert.NotContains(t, got, "my")
	assert.NotContains(t, got, "secret")
	assert.Contains(t, got, "redacted")

	// 未闭合引号（截断/拼接错误文本常见）：值整体掩码而非明文保留。
	gotUnterminated := RedactSensitiveText(`token="unterminated`)
	assert.NotContains(t, gotUnterminated, "unterminated")
	assert.Contains(t, gotUnterminated, "redacted")

	// 分号分隔的多值：后续值不携带字段名，保持现状（cookie 头场景由
	// SanitizeHeaders 覆盖），首值仍被掩码。
	gotSemicolon := RedactSensitiveText("cookie: a=b; c=d")
	assert.NotContains(t, gotSemicolon, "a=b")
	assert.Contains(t, gotSemicolon, "redacted")

	// 闭合引号行为不变。
	gotQuoted := RedactSensitiveText(`token="quoted value with spaces"`)
	assert.NotContains(t, gotQuoted, "quoted")
	assert.Contains(t, gotQuoted, "redacted")
}

func TestRequestTargetRedactsEventSourceToken(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/sse/tasks?token=jwt-secret&level=info", nil)

	got := RequestTarget(req)

	assert.Contains(t, got, "level=info")
	assert.NotContains(t, got, "jwt-secret")
	assert.Contains(t, got, "token=%5Bredacted")
}

func TestRequestTargetFailsClosedForMalformedQuery(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/sse/tasks?token=jwt-secret;level=info", nil)

	got := RequestTarget(req)

	assert.Contains(t, got, "malformed_query=%5Bredacted")
	assert.NotContains(t, got, "jwt-secret")
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

func TestSanitizeLogTextStripsANSIBeforeRedaction(t *testing.T) {
	got := SanitizeLogText("\x1b[36mauth_token\x1b[0m=plain-secret")

	assert.NotContains(t, got, "plain-secret")
	assert.Contains(t, got, "auth_token=[redacted:")
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

func TestRedactSensitiveTextMasksBearerAcrossNewline(t *testing.T) {
	// H6 修复回归：Bearer 令牌被换行续行拆开（多行日志、HTTP 头换行
	// 包装）时，令牌本体必须同样被掩码，不能明文进日志。
	cases := []string{
		"Bearer\nSECRET123",
		"Bearer\rSECRET123",
		"Authorization: Bearer\nSECRET123",
		"token=Bearer\nSECRET123",
	}
	for _, in := range cases {
		t.Run(in, func(t *testing.T) {
			got := RedactSensitiveText(in)

			assert.NotContains(t, got, "SECRET123")
			assert.Contains(t, got, "[redacted:")
		})
	}
}

func TestRedactSensitiveTextMasksTelegramBotTokenInPath(t *testing.T) {
	// P1-4：Telegram token 位于 URL path（/bot<id>:<secret>/...），
	// SanitizeURL 只处理 userinfo/query/fragment 会放行 path 型凭据。
	// 必须在 URL 层识别 Telegram bot path 并掩码 token。
	const token = "123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
	cases := []string{
		"https://api.telegram.org/bot" + token + "/getMe",
		"https://api.telegram.org/file/bot" + token + "/photos/photo.jpg",
		"failed to get me: Get \"https://api.telegram.org/bot" + token + "/getMe\": dial tcp: connection refused",
	}
	for _, in := range cases {
		t.Run(in, func(t *testing.T) {
			got := SanitizeLogText(in)

			assert.NotContains(t, got, token)
			// u.String() 将 [redacted:...] 的方括号 percent-encode（path 段
			// 冒号不编码），输出形如 bot%5Bredacted:hex%5D。
			assert.Contains(t, got, "%5Bredacted")
			// 幂等：二次处理稳定，不二次改写指纹。
			assert.Equal(t, got, SanitizeLogText(got))
		})
	}

	// 非 Telegram URL 的 path 不得被误伤。
	got := SanitizeLogText("https://api.telegram.org/bot-helper/groups")
	assert.Equal(t, "https://api.telegram.org/bot-helper/groups", got)
}

func TestSanitizeURLMasksEncodedKeyCarryingSensitiveValue(t *testing.T) {
	// Low#6：URL 编码的 '=' 混入键名时（"token%3DSECRET123"），ParseQuery
	// 把整串解码为 key、value 为空——键本身携带敏感字段名与值，必须掩码。
	got := SanitizeURL("https://example.com/?token%3DSECRET123&q=keep")

	assert.NotContains(t, got, "SECRET123")
	assert.Contains(t, got, "redacted")
	assert.Contains(t, got, "q=keep")
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
