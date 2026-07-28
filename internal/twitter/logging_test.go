package twitter

import (
	"errors"
	"testing"

	"github.com/go-resty/resty/v2"
)

func TestTwitterLogHelpers(t *testing.T) {
	client := resty.New()
	clientScreenNames.Store(client, "alice")
	t.Cleanup(func() {
		clientScreenNames.Delete(client)
	})

	if got := clientNameForLog(client); got != "@alice" {
		t.Fatalf("clientNameForLog() = %q, want @alice", got)
	}
	if got := clientNameForLog(nil); got != "unknown" {
		t.Fatalf("clientNameForLog(nil) = %q, want unknown", got)
	}
}

func TestEndpointForLog(t *testing.T) {
	got := endpointForLog("https://x.com/i/api/graphql/Test/UserMedia?token=secret-token")
	if got != "x.com/i/api/graphql/Test/UserMedia" {
		t.Fatalf("endpointForLog() = %q", got)
	}

	if got := endpointForLog("/i/api/graphql/Test/UserMedia"); got != "/i/api/graphql/Test/UserMedia" {
		t.Fatalf("endpointForLog(path) = %q", got)
	}
}

func TestErrorForLogRedactsSensitiveText(t *testing.T) {
	got := errorForLog(errors.New("request failed token=secret-token"))

	if got == "" {
		t.Fatal("errorForLog should preserve non-empty error text")
	}
	if got == "request failed token=secret-token" {
		t.Fatalf("errorForLog leaked secret: %s", got)
	}
}
