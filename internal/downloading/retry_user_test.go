package downloading

import (
	"errors"
	"testing"

	"github.com/unkmonster/tmd/internal/utils"
)

func TestIsRetryableUserFetchError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "429", err: &utils.HttpStatusError{Code: 429}, want: true},
		{name: "500", err: &utils.HttpStatusError{Code: 500}, want: true},
		{name: "404", err: &utils.HttpStatusError{Code: 404}, want: false},
		{name: "connection reset", err: errors.New("connection reset by peer"), want: true},
		{name: "timeout", err: errors.New("context deadline exceeded"), want: true},
		{name: "unexpected EOF", err: errors.New("unexpected EOF"), want: true},
		{name: "other", err: errors.New("user unavailable"), want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isRetryableUserFetchError(tt.err); got != tt.want {
				t.Fatalf("isRetryableUserFetchError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
