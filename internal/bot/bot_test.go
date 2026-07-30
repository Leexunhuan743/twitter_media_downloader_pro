package bot

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseDownloadOptions(t *testing.T) {
	remaining, opts := ParseDownloadOptions("alice auto_follow=true sp=true nr=false")

	assert.Equal(t, "alice", remaining)
	assert.True(t, opts.AutoFollow)
	assert.True(t, opts.SkipProfile)
	assert.False(t, opts.NoRetry)
}

func TestParseDownloadOptionsKeepsUnknownKey(t *testing.T) {
	remaining, opts := ParseDownloadOptions("alice typo=true")

	assert.Equal(t, "alice typo=true", remaining)
	assert.Equal(t, DownloadOptions{}, opts)
}
