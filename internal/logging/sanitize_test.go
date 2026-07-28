package logging

import (
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

func TestPathForLog(t *testing.T) {
	assert.Equal(t, "C:/Users/leeexx/AppData/Roaming/.tmd2/bot_config.yaml", Path(`C:\Users\leeexx\AppData\Roaming\.tmd2\bot_config.yaml`))
	assert.Equal(t, "/home/user/.tmd2/bot_config.yaml", Path("/home/user/.tmd2/bot_config.yaml"))
	assert.Equal(t, "F:/twitter dl/.data/foo.db", Path(`F:\twitter dl\.data\foo.db`))
}

func TestSanitizeURLRedactsSensitiveQueryParams(t *testing.T) {
	got := SanitizeURL("/api/v1/logs/stream?token=secret-token&q=download&api_key=abc123")

	assert.Contains(t, got, "q=download")
	assert.NotContains(t, got, "secret-token")
	assert.NotContains(t, got, "abc123")
	assert.Contains(t, got, "token=%5Bredacted")
	assert.Contains(t, got, "api_key=%5Bredacted")
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
