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
func TestParseLogTimeSupportsLogrusTextLines(t *testing.T) {
	got, ok := parseLogTime(`time="2026-10-19T14:14:57.123456+08:00" level=info msg="[api] GET / status=200"`)
	if !ok {
		t.Fatal("parseLogTime() did not parse logrus time= field")
	}
	want := time.Date(2026, 10, 19, 14, 14, 57, 123456000, time.FixedZone("", 8*60*60))
	if !got.Equal(want) {
		t.Fatalf("parseLogTime() = %s, want %s", got, want)
	}
}

func TestParseLogLevelSupportsLogrusTextLines(t *testing.T) {
	cases := map[string]string{
		`time="2026-10-19T14:14:57+08:00" level=debug msg="[api] detail"`: "debug",
		`time="2026-10-19T14:14:57+08:00" level=info msg="[api] ok"`:     "info",
		`time="2026-10-19T14:14:57+08:00" level=warning msg="[api] slow"`: "warn",
		`time="2026-10-19T14:14:57+08:00" level=error msg="[api] boom"`:   "error",
		`time="2026-10-19T14:14:57+08:00" level=fatal msg="[api] dead"`:   "fatal",
		`INFO[2026-10-19T14:14:57+08:00] [api] ok`:                        "info",
	}
	for line, want := range cases {
		if got := parseLogLevel(line); got != want {
			t.Fatalf("parseLogLevel(%q) = %q, want %q", line, got, want)
		}
	}
}

func TestLogPayloadUnescapesLogrusMessage(t *testing.T) {
	line := `time="2026-10-19T14:14:57+08:00" level=error msg="[download] failed path=\"C:\\tmp\\a.json\" reason=\"boom\""`
	got := logPayload(line)
	want := `[download] failed path="C:\tmp\a.json" reason="boom"`
	if got != want {
		t.Fatalf("logPayload() = %q, want %q", got, want)
	}
}

func TestFilterLogLinesReverseSupportsLogrusLines(t *testing.T) {
	lines := []string{
		`time="2026-10-19T14:00:00+08:00" level=info msg="[api] GET /"`,
		`time="2026-10-19T14:01:00+08:00" level=warn msg="[download] slow"`,
		`time="2026-10-19T14:02:00+08:00" level=error msg="[download] boom"`,
		`time="2026-10-19T14:03:00+08:00" level=fatal msg="[download] dead"`,
	}
	if got := filterLogLinesReverse(lines, "error", "", "all", false, time.Time{}, false, time.Time{}); len(got) != 2 {
		t.Fatalf("error filter returned %d lines, want 2 (error + fatal)", len(got))
	}
	if got := filterLogLinesReverse(lines, "all", "", "download", false, time.Time{}, false, time.Time{}); len(got) != 3 {
		t.Fatalf("domain filter returned %d lines, want 3", len(got))
	}
	from := time.Date(2026, 10, 19, 14, 1, 30, 0, time.FixedZone("", 8*60*60))
	got := filterLogLinesReverse(lines, "all", "", "all", true, from, false, time.Time{})
	if len(got) != 2 || got[0] != lines[3] || got[1] != lines[2] {
		t.Fatalf("time filter = %#v, want the two newest lines", got)
	}
	if got := filterLogLinesReverse(lines, "info", "", "api", false, time.Time{}, false, time.Time{}); len(got) != 1 {
		t.Fatalf("level+domain+combined filter returned %d lines, want 1", len(got))
	}
}
