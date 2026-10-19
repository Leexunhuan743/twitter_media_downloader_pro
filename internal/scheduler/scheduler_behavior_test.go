package scheduler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFormatScheduleDisplayIncludesSeconds(t *testing.T) {
	cases := []struct {
		interval time.Duration
		want     string
	}{
		{90 * time.Second, "每 1 分钟 30 秒"},
		{time.Hour + 30*time.Minute + 15*time.Second, "每 1 小时 30 分钟 15 秒"},
		{24*time.Hour + 5*time.Second, "每 24 小时 5 秒"},
		{time.Hour + 5*time.Second, "每 1 小时 5 秒"},
		{2 * time.Minute, "每 2 分钟"},
		{2 * time.Hour, "每 2 小时"},
		{90 * time.Minute, "每 1 小时 30 分钟"},
		{36 * time.Hour, "每 1 天 12 小时"},
		{72 * time.Hour, "每 3 天"},
		{time.Minute + 500*time.Millisecond, "每 1 分钟 0.5 秒"},
		{time.Hour + 1250*time.Millisecond, "每 1 小时 1.25 秒"},
	}
	for _, tc := range cases {
		got := FormatScheduleDisplay(&ParsedSchedule{Mode: ScheduleModeInterval, Interval: tc.interval}, "")
		if got != tc.want {
			t.Errorf("FormatScheduleDisplay(%v) = %q, want %q", tc.interval, got, tc.want)
		}
	}
}

func TestFormatScheduleDisplayNilReturnsRaw(t *testing.T) {
	if got, want := FormatScheduleDisplay(nil, "interval:2h"), "interval:2h"; got != want {
		t.Fatalf("display = %q, want %q", got, want)
	}
}

func TestParseScheduleDedupesBeforeDailyLimit(t *testing.T) {
	// 97 个相同时间只算 1 个；上限按去重后的时间点数判定。
	dups := make([]string, 0, 97)
	for i := 0; i < 97; i++ {
		dups = append(dups, "07:00")
	}
	parsed, err := ParseSchedule("daily:" + strings.Join(dups, ","))
	if err != nil {
		t.Fatalf("ParseSchedule(97 duplicate times): %v", err)
	}
	if got := len(parsed.Times); got != 1 {
		t.Fatalf("deduped times = %d, want 1", got)
	}

	distinct := make([]string, 0, maxDailyTimes+1)
	for i := 0; i <= maxDailyTimes; i++ {
		distinct = append(distinct, fmt.Sprintf("%02d:%02d", i/60, i%60))
	}
	if _, err := ParseSchedule("daily:" + strings.Join(distinct, ",")); err == nil {
		t.Fatalf("ParseSchedule(%d distinct times) error = nil, want limit error", len(distinct))
	}
}

func TestParseScheduleDeduplicatesDailyTimes(t *testing.T) {
	parsed, err := ParseSchedule("daily:07:00,07:00,21:00")
	if err != nil {
		t.Fatalf("ParseSchedule: %v", err)
	}
	if len(parsed.Times) != 2 {
		t.Fatalf("Times = %d entries (%v), want 2", len(parsed.Times), parsed.Times)
	}
	if parsed.Times[0].Hour() != 7 || parsed.Times[1].Hour() != 21 {
		t.Fatalf("deduplicated order changed: %v", parsed.Times)
	}
	if len(parsed.SortedTimes) != 2 {
		t.Fatalf("SortedTimes = %d entries, want 2", len(parsed.SortedTimes))
	}
	if got, want := FormatScheduleDisplay(parsed, ""), "每天 07:00, 21:00"; got != want {
		t.Fatalf("display = %q, want %q", got, want)
	}

	parsed, err = ParseSchedule("daily:21:00,07:00,21:00")
	if err != nil {
		t.Fatalf("ParseSchedule: %v", err)
	}
	if got, want := FormatScheduleDisplay(parsed, ""), "每天 21:00, 07:00"; got != want {
		t.Fatalf("display = %q, want %q", got, want)
	}
}

func TestGetStatusesReturnsIsolatedTimeValues(t *testing.T) {
	lastRun := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	nextRun := time.Date(2026, 1, 2, 4, 4, 5, 0, time.UTC)
	sc := &Scheduler{statuses: []ScheduleStatus{{
		Entry:     ScheduleEntry{ID: "a", Users: []string{"alice"}, Lists: []string{"42"}},
		LastRunAt: &lastRun,
		NextRunAt: &nextRun,
	}}}

	snapshot := sc.GetStatuses()
	if len(snapshot) != 1 {
		t.Fatalf("GetStatuses len = %d, want 1", len(snapshot))
	}
	*snapshot[0].LastRunAt = time.Unix(0, 0)
	*snapshot[0].NextRunAt = time.Unix(0, 0)
	snapshot[0].Entry.Name = "mutated"

	if !sc.statuses[0].LastRunAt.Equal(lastRun) {
		t.Fatalf("internal LastRunAt mutated: %v", sc.statuses[0].LastRunAt)
	}
	if !sc.statuses[0].NextRunAt.Equal(nextRun) {
		t.Fatalf("internal NextRunAt mutated: %v", sc.statuses[0].NextRunAt)
	}
	if sc.statuses[0].Entry.Name == "mutated" {
		t.Fatal("internal Entry mutated through snapshot")
	}

	snapshot[0].Entry.Users[0] = "mutated"
	snapshot[0].Entry.Lists = append(snapshot[0].Entry.Lists, "99")
	if got := sc.statuses[0].Entry.Users[0]; got != "alice" {
		t.Fatalf("internal Entry.Users mutated through snapshot: %q", got)
	}
	if got := len(sc.statuses[0].Entry.Lists); got != 1 {
		t.Fatalf("internal Entry.Lists mutated through snapshot: len = %d", got)
	}
}

func TestStatusChangeCallbackCannotMutateSchedulerState(t *testing.T) {
	nextRun := time.Date(2026, 1, 2, 4, 4, 5, 0, time.UTC)
	entry := ScheduleEntry{ID: "a"}
	sc := &Scheduler{
		entries:  []ScheduleEntry{entry},
		statuses: []ScheduleStatus{{Entry: entry, NextRunAt: &nextRun}},
	}
	sc.OnStatusChange = func(running bool, statuses []ScheduleStatus) {
		for i := range statuses {
			if statuses[i].NextRunAt != nil {
				*statuses[i].NextRunAt = time.Unix(0, 0)
			}
		}
	}

	if !sc.updateStatus(0, entry, func(*ScheduleStatus) {}) {
		t.Fatal("updateStatus returned false")
	}
	if !sc.statuses[0].NextRunAt.Equal(nextRun) {
		t.Fatalf("callback mutated internal NextRunAt: %v", sc.statuses[0].NextRunAt)
	}
}

func TestIsRunningDoesNotWaitForLifecycleLock(t *testing.T) {
	sc := &Scheduler{}
	sc.lifecycleMu.Lock()
	done := make(chan struct{})
	go func() {
		_ = sc.IsRunning()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		sc.lifecycleMu.Unlock()
		t.Fatal("IsRunning blocked on lifecycleMu; a status callback calling it would deadlock Stop")
	}
	sc.lifecycleMu.Unlock()
}

func newPanicScheduler(t *testing.T) (*Scheduler, ScheduleEntry) {
	t.Helper()
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	content := []byte("schedules:\n" +
		"  - id: panic-entry\n" +
		"    type: user\n" +
		"    target: alice\n" +
		"    name: Panic\n" +
		"    schedule: \"interval:1h\"\n" +
		"    enabled: true\n")
	if err := os.WriteFile(configPath, content, 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	sc, err := New(configPath, func(ScheduleEntry) (string, error) {
		panic("boom")
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(sc.Stop)
	if len(sc.entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(sc.entries))
	}
	return sc, sc.entries[0]
}

func TestTriggerPanicReturnsErrorAndRecordsFailure(t *testing.T) {
	sc, _ := newPanicScheduler(t)

	taskID, err := sc.Trigger(0)
	if taskID != "" {
		t.Fatalf("taskID = %q, want empty", taskID)
	}
	if err == nil || !strings.Contains(err.Error(), "panic") {
		t.Fatalf("Trigger error = %v, want panic error", err)
	}

	status := sc.GetStatuses()[0]
	if status.Triggering {
		t.Fatal("Triggering not released after panic")
	}
	if status.RunCount != 1 || status.ConsecutiveFailures != 1 {
		t.Fatalf("RunCount=%d ConsecutiveFailures=%d, want 1/1", status.RunCount, status.ConsecutiveFailures)
	}
	if !strings.Contains(status.LastError, "panic") {
		t.Fatalf("LastError = %q, want panic message", status.LastError)
	}
}

func TestExecutePanicRecordsFailureWithoutEscaping(t *testing.T) {
	sc, entry := newPanicScheduler(t)

	sc.execute(0, entry, sc.generation)

	status := sc.GetStatuses()[0]
	if status.Triggering {
		t.Fatal("Triggering not released after scheduled panic")
	}
	if status.RunCount != 1 || status.ConsecutiveFailures != 1 {
		t.Fatalf("RunCount=%d ConsecutiveFailures=%d, want 1/1", status.RunCount, status.ConsecutiveFailures)
	}
}
