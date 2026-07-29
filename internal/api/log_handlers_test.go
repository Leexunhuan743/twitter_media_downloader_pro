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

func TestMatchLogDomainSupportsTextFormatterLines(t *testing.T) {
	line := `WARN[2026-07-29T04:55:01+08:00] [download] Retry failed fixture_id=fake-log-001`
	if !matchLogDomain(line, "download") {
		t.Fatal("matchLogDomain() should match bracketed domain after text formatter prefix")
	}
	if !matchLogDomain(line, "[download]") {
		t.Fatal("matchLogDomain() should accept bracketed domain input")
	}
	if matchLogDomain(line, "api") {
		t.Fatal("matchLogDomain() should reject other domains")
	}
}

func TestMatchLogDomainSupportsBareDomainLines(t *testing.T) {
	if !matchLogDomain(`[download] Already highlighted title`, "download") {
		t.Fatal("matchLogDomain() should match bare bracketed domain lines")
	}
}

func TestFilterLogLinesReverseAppliesDomain(t *testing.T) {
	lines := []string{
		`INFO[2026-07-29T04:55:01+08:00] [api] GET / status=200`,
		`INFO[2026-07-29T04:55:02+08:00] [download] First`,
		`WARN[2026-07-29T04:55:03+08:00] [download] Second`,
	}
	got := filterLogLinesReverse(lines, "all", "", "download", false, time.Time{}, false, time.Time{})
	if len(got) != 2 {
		t.Fatalf("filterLogLinesReverse() returned %d lines, want 2", len(got))
	}
	if got[0] != lines[2] || got[1] != lines[1] {
		t.Fatalf("filterLogLinesReverse() should preserve reverse chronological order, got %#v", got)
	}
}
