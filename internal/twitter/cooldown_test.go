package twitter

import (
	"testing"
	"time"

	"github.com/go-resty/resty/v2"
)

func TestParseRetryAfter(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want time.Duration
	}{
		{name: "empty", in: "", want: defaultClientCooldown},
		{name: "invalid", in: "abc", want: defaultClientCooldown},
		{name: "zero", in: "0", want: defaultClientCooldown},
		{name: "seconds", in: "47", want: 47 * time.Second},
		{name: "whitespace", in: " 60 ", want: 60 * time.Second},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseRetryAfter(tt.in); got != tt.want {
				t.Fatalf("parseRetryAfter(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestClientInCooldownLifecycle(t *testing.T) {
	cli := resty.New()
	if clientInCooldown(cli) {
		t.Fatal("new client should not be in cooldown")
	}

	setClientCooldownUntil(cli, time.Now().Add(time.Hour))
	if !clientInCooldown(cli) {
		t.Fatal("client with future cooldown should be in cooldown")
	}

	setClientCooldownUntil(cli, time.Now().Add(-time.Second))
	if clientInCooldown(cli) {
		t.Fatal("client with expired cooldown should not be in cooldown")
	}
}
