package downloading

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseMarkTimeValue(t *testing.T) {
	// 2026-08-11T12:30:00Z 的绝对时刻。
	utcInstant := time.Date(2026, 8, 11, 12, 30, 0, 0, time.UTC)

	t.Run("rfc3339_with_z_parsed_as_absolute_utc", func(t *testing.T) {
		parsed, err := ParseMarkTimeValue("2026-08-11T12:30:00Z")
		require.NoError(t, err)
		assert.True(t, parsed.Equal(utcInstant))
		assert.Equal(t, time.UTC, parsed.Location())
	})

	t.Run("rfc3339_with_offset_keeps_instant", func(t *testing.T) {
		parsed, err := ParseMarkTimeValue("2026-08-11T20:30:00+08:00")
		require.NoError(t, err)
		// 20:30+08:00 == 12:30Z
		assert.True(t, parsed.Equal(utcInstant))
	})

	t.Run("wall_clock_without_offset_uses_local", func(t *testing.T) {
		// CLI 契约：无时区输入按服务器本地墙钟解释。
		parsed, err := ParseMarkTimeValue("2026-08-11T20:30:00")
		require.NoError(t, err)
		loc, err := time.LoadLocation("Local")
		require.NoError(t, err)
		assert.Equal(t, loc, parsed.Location())
		assert.Equal(t, 2026, parsed.Year())
		assert.Equal(t, time.August, parsed.Month())
		assert.Equal(t, 11, parsed.Day())
		assert.Equal(t, 20, parsed.Hour())
		assert.Equal(t, 30, parsed.Minute())
	})

	t.Run("invalid_input_returns_error", func(t *testing.T) {
		_, err := ParseMarkTimeValue("not-a-time")
		require.Error(t, err)
		_, err = ParseMarkTimeValue("2026-13-99T99:99:99")
		require.Error(t, err)
	})

	t.Run("rfc3339_with_milliseconds", func(t *testing.T) {
		parsed, err := ParseMarkTimeValue("2026-08-11T12:30:00.500Z")
		require.NoError(t, err)
		assert.Equal(t, utcInstant.Unix(), parsed.Unix())
		assert.Equal(t, 500*time.Millisecond, time.Duration(parsed.Nanosecond()))
	})

	t.Run("null_and_nil_mean_full_mark", func(t *testing.T) {
		for _, s := range []string{"null", "NULL", "Nil"} {
			parsed, err := ParseMarkTimeValue(s)
			require.NoError(t, err, "input %q", s)
			assert.True(t, parsed.IsZero(), "input %q should yield zero time sentinel", s)
		}
	})
}
