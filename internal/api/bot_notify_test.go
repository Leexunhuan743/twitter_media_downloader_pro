package api

import "testing"

func TestIsBotAlertLogLine(t *testing.T) {
	tests := []struct {
		name string
		line string
		want bool
	}{
		{name: "text formatter error", line: `ERRO[2026-07-29T10:00:00+08:00] [download] failed`, want: true},
		{name: "text formatter fatal", line: `FATA[2026-07-29T10:00:00+08:00] [startup] failed`, want: true},
		{name: "info ignored", line: `INFO[2026-07-29T10:00:00+08:00] [download] complete`, want: false},
		{name: "warning ignored", line: `WARN[2026-07-29T10:00:00+08:00] [download] retrying`, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isBotAlertLogLine(tt.line); got != tt.want {
				t.Fatalf("isBotAlertLogLine() = %t, want %t", got, tt.want)
			}
		})
	}
}
