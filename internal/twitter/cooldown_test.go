package twitter

import (
	"context"
	"errors"
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
		{name: "clamped", in: "999999", want: maxRetryAfterSeconds * time.Second},
		// 回归：未做上限时 `time.Duration(secs) * time.Second` 溢出成负值，
		// setClientCooldown 会把负冷却当作“无需冷却”忽略，账号完全不被冷却。
		{name: "overflow int64", in: "9999999999", want: maxRetryAfterSeconds * time.Second},
		{name: "max int64", in: "9223372036854775807", want: maxRetryAfterSeconds * time.Second},
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

func TestAllAdditionalInCooldown(t *testing.T) {
	if allAdditionalInCooldown(nil) {
		t.Fatal("nil additional should not be considered all cooling")
	}
	if allAdditionalInCooldown([]*resty.Client{}) {
		t.Fatal("empty additional should not be considered all cooling")
	}

	a := resty.New()
	b := resty.New()
	if allAdditionalInCooldown([]*resty.Client{a, b}) {
		t.Fatal("fresh clients should not be all cooling")
	}

	setClientCooldownUntil(a, time.Now().Add(time.Hour))
	if allAdditionalInCooldown([]*resty.Client{a, b}) {
		t.Fatal("partially cooling clients should not be all cooling")
	}

	setClientCooldownUntil(b, time.Now().Add(time.Hour))
	if !allAdditionalInCooldown([]*resty.Client{a, b}) {
		t.Fatal("all cooling clients should be recognized")
	}

	setClientCooldownUntil(a, time.Now().Add(-time.Second))
	setClientCooldownUntil(b, time.Now().Add(-time.Second))
	if allAdditionalInCooldown([]*resty.Client{a, b}) {
		t.Fatal("expired cooldowns should not count as all cooling")
	}
}

func TestAllAdditionalInCooldownIgnoresHardErrors(t *testing.T) {
	a := resty.New()
	b := resty.New()
	SetClientError(b, errors.New("hard error"))

	if allAdditionalInCooldown([]*resty.Client{a, b}) {
		t.Fatal("hard-error client without cooldown must not make all additional cooling")
	}

	setClientCooldownUntil(a, time.Now().Add(time.Hour))
	if allAdditionalInCooldown([]*resty.Client{a, b}) {
		t.Fatal("hard-error client without cooldown must not count as cooling even when other clients cool")
	}

	setClientCooldownUntil(b, time.Now().Add(time.Hour))
	if !allAdditionalInCooldown([]*resty.Client{a, b}) {
		t.Fatal("all additional cooling should be true when every client, including a hard-error client, is cooling")
	}

	setClientCooldownUntil(a, time.Now().Add(-time.Second))
	setClientCooldownUntil(b, time.Now().Add(-time.Second))
}

func TestSelectClientMFQGlobalCooldownNotArmedWithHardError(t *testing.T) {
	setGlobalCooldownUntil(time.Time{})
	ctx := context.Background()
	master := resty.New()
	a := resty.New()
	b := resty.New()
	SetClientError(b, errors.New("hard error"))
	additional := []*resty.Client{a, b}

	setClientCooldownUntil(a, time.Now().Add(time.Hour))
	SelectClientMFQ(ctx, master, additional, nil, "/i/api/graphql/UserMedia")

	globalCooldownMu.Lock()
	active := globalCooldownUntil.After(time.Now())
	globalCooldownMu.Unlock()
	if active {
		t.Fatal("global cooldown must not be set when a hard-error client is not cooling")
	}

	setGlobalCooldownUntil(time.Time{})
	setClientCooldownUntil(a, time.Now().Add(-time.Second))
}

func TestSelectClientMFQRoundRobin(t *testing.T) {
	additionalClientCursor.Store(0)
	ctx := context.Background()
	master := resty.New()
	a := resty.New()
	b := resty.New()
	c := resty.New()
	additional := []*resty.Client{a, b, c}

	for i := 0; i < 6; i++ {
		got := SelectClientMFQ(ctx, master, additional, nil, "/i/api/graphql/UserMedia")
		want := additional[i%len(additional)]
		if got != want {
			t.Fatalf("round-robin iteration %d: got client %p, want %p", i, got, want)
		}
	}
}

func TestSelectClientMFQGlobalCooldownOnlyWhenAllCooling(t *testing.T) {
	setGlobalCooldownUntil(time.Time{})
	ctx := context.Background()
	master := resty.New()
	a := resty.New()
	b := resty.New()
	additional := []*resty.Client{a, b}

	SelectClientMFQ(ctx, master, additional, nil, "/i/api/graphql/UserMedia")
	globalCooldownMu.Lock()
	active := globalCooldownUntil.After(time.Now())
	globalCooldownMu.Unlock()
	if active {
		t.Fatal("global cooldown should not be set when not all additional accounts are cooling")
	}

	setClientCooldownUntil(a, time.Now().Add(time.Hour))
	setClientCooldownUntil(b, time.Now().Add(time.Hour))
	SelectClientMFQ(ctx, master, additional, nil, "/i/api/graphql/UserMedia")
	globalCooldownMu.Lock()
	active = globalCooldownUntil.After(time.Now())
	globalCooldownMu.Unlock()
	if !active {
		t.Fatal("global cooldown should be set when all additional accounts are cooling")
	}

	setGlobalCooldownUntil(time.Time{})
	setClientCooldownUntil(a, time.Now().Add(-time.Second))
	setClientCooldownUntil(b, time.Now().Add(-time.Second))
}

func TestArmGlobalCooldownIfIdleDoesNotExtend(t *testing.T) {
	setGlobalCooldownUntil(time.Now().Add(30 * time.Second))
	globalCooldownMu.Lock()
	before := globalCooldownUntil
	globalCooldownMu.Unlock()

	armGlobalCooldownIfIdle(time.Minute)

	globalCooldownMu.Lock()
	after := globalCooldownUntil
	globalCooldownMu.Unlock()
	if !after.Equal(before) {
		t.Fatal("armGlobalCooldownIfIdle must not extend an already active global cooldown")
	}

	setGlobalCooldownUntil(time.Time{})
}

func TestWaitGlobalCooldown(t *testing.T) {
	ctx := context.Background()

	setGlobalCooldownUntil(time.Now().Add(-time.Second))
	if err := waitGlobalCooldown(ctx); err != nil {
		t.Fatalf("expired global cooldown should not block: %v", err)
	}

	setGlobalCooldownUntil(time.Now().Add(time.Hour))
	ctx2, cancel := context.WithTimeout(ctx, 10*time.Millisecond)
	defer cancel()
	if err := waitGlobalCooldown(ctx2); err == nil {
		t.Fatal("active global cooldown should block until context is done")
	}

	setGlobalCooldownUntil(time.Time{})
}
