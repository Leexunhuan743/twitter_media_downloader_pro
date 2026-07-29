package api

import (
	"testing"
	"time"
)

func TestParseLogTimeSupportsCurrentTextFormatter(t *testing.T) {
	got, ok := parseLogTime(`INFO[2026-07-29T04:55:01+08:00] [server] Shutdown complete`)
	if !ok {
		t.Fatal("parseLogTime() did not parse current text formatter timestamp")
	}
	want := time.Date(2026, 7, 29, 4, 55, 1, 0, time.FixedZone("", 8*60*60))
	if !got.Equal(want) {
		t.Fatalf("parseLogTime() = %s, want %s", got, want)
	}
}

func TestMatchLogLevelTreatsFatalAsErrorStatsInput(t *testing.T) {
	if !matchLogLevel(`FATA[2026-07-29T04:55:01+08:00] [startup] failed`, "fatal") {
		t.Fatal("matchLogLevel() should match fatal text formatter lines")
	}
}

func TestMatchLogLevelTreatsFatalAsErrorFilterInput(t *testing.T) {
	if !matchLogLevel(`FATA[2026-07-29T04:55:01+08:00] [startup] failed`, "error") {
		t.Fatal("matchLogLevel() should include fatal text formatter lines in error filters")
	}
}
