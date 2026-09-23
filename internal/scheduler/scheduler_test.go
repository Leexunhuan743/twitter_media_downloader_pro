package scheduler

import (
	"errors"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestTriggerSkipsStatusUpdateWhenReloadReplacesEntries(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	initial := []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`)
	if err := os.WriteFile(configPath, initial, 0600); err != nil {
		t.Fatalf("write initial config: %v", err)
	}

	started := make(chan struct{})
	release := make(chan struct{})
	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		close(started)
		<-release
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	t.Cleanup(sc.Stop)

	done := make(chan error, 1)
	go func() {
		_, err := sc.Trigger(0)
		done <- err
	}()

	<-started
	if err := os.WriteFile(configPath, []byte("schedules: []\n"), 0600); err != nil {
		t.Fatalf("write replacement config: %v", err)
	}
	if err := sc.Reload(); err != nil {
		t.Fatalf("reload scheduler: %v", err)
	}
	close(release)

	if err := <-done; err != nil {
		t.Fatalf("trigger returned error: %v", err)
	}
	if statuses := sc.GetStatuses(); len(statuses) != 0 {
		t.Fatalf("expected reloaded empty statuses, got %d", len(statuses))
	}
}

func TestTriggerReleaseAfterReloadDoesNotClearNewGenerationTrigger(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	content := []byte(`schedules:
  - id: same
    type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`)
	if err := os.WriteFile(configPath, content, 0600); err != nil {
		t.Fatalf("write initial config: %v", err)
	}

	firstStarted := make(chan struct{})
	firstRelease := make(chan struct{})
	secondStarted := make(chan struct{})
	secondRelease := make(chan struct{})
	var calls atomic.Int32
	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		switch calls.Add(1) {
		case 1:
			close(firstStarted)
			<-firstRelease
			return "task-1", nil
		case 2:
			close(secondStarted)
			<-secondRelease
			return "task-2", nil
		default:
			t.Fatal("unexpected extra trigger")
			return "", nil
		}
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	t.Cleanup(sc.Stop)

	firstDone := make(chan error, 1)
	go func() {
		_, err := sc.TriggerByID("same")
		firstDone <- err
	}()
	<-firstStarted

	if err := os.WriteFile(configPath, content, 0600); err != nil {
		t.Fatalf("write reload config: %v", err)
	}
	if err := sc.Reload(); err != nil {
		t.Fatalf("reload scheduler: %v", err)
	}

	secondDone := make(chan error, 1)
	go func() {
		_, err := sc.TriggerByID("same")
		secondDone <- err
	}()
	<-secondStarted

	close(firstRelease)
	if err := <-firstDone; err != nil {
		t.Fatalf("first trigger returned error: %v", err)
	}
	statuses := sc.GetStatuses()
	if len(statuses) != 1 {
		t.Fatalf("expected one status, got %d", len(statuses))
	}
	if !statuses[0].Triggering {
		t.Fatal("old generation release cleared the active new generation trigger")
	}

	close(secondRelease)
	if err := <-secondDone; err != nil {
		t.Fatalf("second trigger returned error: %v", err)
	}
	statuses = sc.GetStatuses()
	if len(statuses) != 1 {
		t.Fatalf("expected one status after second trigger, got %d", len(statuses))
	}
	if statuses[0].Triggering {
		t.Fatal("second trigger did not release triggering flag")
	}
	if statuses[0].LastTaskID != "task-2" {
		t.Fatalf("expected current generation task id to be task-2, got %q", statuses[0].LastTaskID)
	}
}

func TestStartIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
    run_on_start: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	var calls atomic.Int32
	firstRun := make(chan struct{})
	var runOnce sync.Once
	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		calls.Add(1)
		runOnce.Do(func() { close(firstRun) })
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}

	// 首次执行完整落账（RunCount=1 且 Triggering 已释放）时才发信号：这是
	// 后面能确定性区分「重复 Start 多拉了一个 goroutine」的前提。
	executed := make(chan struct{}, 1)
	sc.OnStatusChange = func(_ bool, statuses []ScheduleStatus) {
		if len(statuses) == 1 && statuses[0].RunCount == 1 && !statuses[0].Triggering {
			select {
			case executed <- struct{}{}:
			default:
			}
		}
	}

	sc.Start()
	sc.Start() // 重复 Start 必须是 no-op

	select {
	case <-firstRun:
	case <-time.After(2 * time.Second):
		t.Fatal("run_on_start execution was not observed")
	}
	select {
	case <-executed:
	case <-time.After(2 * time.Second):
		t.Fatal("first execution result was not published to the status callback")
	}

	// 防重入 guard 已释放后再调一次 Start：若重复 Start 真的又拉起一个 loop
	// goroutine，它要么在 Stop 的 wg.Wait 返回前再执行一次 run_on_start
	// （计数变 2），要么因覆盖 sc.cancel 而让老 goroutine 的 context 永不被
	// 取消、Stop 永不返回。两种表现都是缺陷，因此用带兜底的 select 等 Stop，
	// 而不是 time.Sleep 窗口；此处不注册 t.Cleanup(sc.Stop)，否则缺陷场景下
	// 兜底失败后的清理会再次卡在 wg.Wait。
	sc.Start()
	stopped := make(chan struct{})
	go func() {
		sc.Stop()
		close(stopped)
	}()
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("duplicate Start leaked a scheduler goroutine: Stop never returned")
	}

	if got := calls.Load(); got != 1 {
		t.Fatalf("expected one immediate scheduled run after duplicate Start, got %d", got)
	}
}

func TestReloadDoesNotStartStoppedScheduler(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	content := []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
    run_on_start: true
`)
	if err := os.WriteFile(configPath, content, 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	var calls atomic.Int32
	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		calls.Add(1)
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	t.Cleanup(sc.Stop)

	if err := sc.Reload(); err != nil {
		t.Fatalf("reload scheduler: %v", err)
	}

	// Reload 在未启动的调度器上必须是同步 no-op：不得拉起 loop goroutine
	// （IsRunning / NextRunAt 是可观测状态），也不得执行 run_on_start。
	// 这里没有"某事发生"可等（负向语义），因此断言可观测状态；随后的 Stop
	// 是确定性同步点——若 Reload 误启动了 goroutine，Stop 会等待它把
	// run_on_start 跑完，计数随即变成 1。
	if sc.IsRunning() {
		t.Fatal("expected Reload on a stopped scheduler to keep it stopped")
	}
	if next := sc.GetStatuses()[0].NextRunAt; next != nil {
		t.Fatalf("expected no next run time for a stopped scheduler, got %v", next)
	}
	sc.Stop()

	if got := calls.Load(); got != 0 {
		t.Fatalf("expected Reload on a stopped scheduler not to start jobs, got %d calls", got)
	}
}

func TestReloadDoesNotTriggerRunOnStart(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	content := []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
    run_on_start: true
`)
	if err := os.WriteFile(configPath, content, 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	var calls atomic.Int32
	firstRun := make(chan struct{})
	var runOnce sync.Once
	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		calls.Add(1)
		runOnce.Do(func() { close(firstRun) })
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	t.Cleanup(sc.Stop)

	sc.Start()
	select {
	case <-firstRun:
	case <-time.After(2 * time.Second):
		t.Fatal("initial run_on_start execution was not observed")
	}

	if got := calls.Load(); got != 1 {
		t.Fatalf("expected one immediate run on first Start, got %d", got)
	}

	if err := sc.Reload(); err != nil {
		t.Fatalf("reload scheduler: %v", err)
	}

	// Reload 重启的 loop 不得再执行 run_on_start（firstStart 已被首次 Start 消费）。
	// Stop 会 wg.Wait 等待重启后的 goroutine 退出，因此这是确定性同步点：
	// 若 Reload 误触发了 run_on_start，计数会在 Stop 返回前变成 2。
	sc.Stop()

	if got := calls.Load(); got != 1 {
		t.Fatalf("expected Reload not to trigger run_on_start, got %d calls", got)
	}
}

func TestStopIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}

	sc.Stop()
	sc.Stop()

	if sc.IsRunning() {
		t.Fatal("expected scheduler to remain stopped after duplicate Stop")
	}
}

func TestIntervalDefaultDelaysFirstRun(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	const firstDelay = 80 * time.Millisecond
	oldRandomIntervalDelay := randomIntervalDelay
	randomIntervalDelay = func(interval time.Duration, entryID string) time.Duration {
		return firstDelay
	}
	t.Cleanup(func() {
		randomIntervalDelay = oldRandomIntervalDelay
	})

	ran := make(chan struct{})
	var runOnce sync.Once
	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		runOnce.Do(func() { close(ran) })
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	t.Cleanup(sc.Stop)

	// 首次状态变更必须是「排定首次运行时间」而不是「已执行一次」：run_on_start
	// 默认 false 时 runIntervalLoop 走 waitInterval（先写 NextRunAt 再起计时器），
	// 若默认值被改成 true，第一次回调就会带 RunCount=1。用状态回调作为事件
	// 同步点，避免"睡一小段再断言没跑"的墙钟窗口。
	firstChange := make(chan ScheduleStatus, 1)
	sc.OnStatusChange = func(_ bool, statuses []ScheduleStatus) {
		if len(statuses) != 1 {
			return
		}
		select {
		case firstChange <- statuses[0]:
		default:
		}
	}

	start := time.Now()
	sc.Start()

	select {
	case status := <-firstChange:
		if status.RunCount != 0 {
			t.Fatalf("expected run_on_start=false to delay the first run, but it already ran %d time(s)", status.RunCount)
		}
		if status.NextRunAt == nil {
			t.Fatal("expected the first status change to schedule NextRunAt")
		}
		// NextRunAt 是 waitInterval 在起计时器前写入的 now+delay：必须落在未来
		// 约 firstDelay 处，而不是"立即"（≈start）或直接使用真实 interval（1h）。
		delay := status.NextRunAt.Sub(start)
		if delay < firstDelay/2 || delay > time.Minute {
			t.Fatalf("expected first run to be delayed by ~%v, got %v", firstDelay, delay)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("scheduler did not publish a first status change")
	}

	// 首次执行仍必须发生，只是被推迟到 firstDelay 之后。
	select {
	case <-ran:
	case <-time.After(2 * time.Second):
		t.Fatal("delayed first run never executed")
	}
}

func TestTriggerReturnsErrorWhenDownloadFuncReturnsEmptyTaskID(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		return "", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}

	taskID, err := sc.Trigger(0)
	if err == nil {
		t.Fatal("expected empty task_id to return an error")
	}
	if taskID != "" {
		t.Fatalf("expected empty task id, got %q", taskID)
	}

	statuses := sc.GetStatuses()
	if len(statuses) != 1 {
		t.Fatalf("expected one status, got %d", len(statuses))
	}
	if statuses[0].RunCount != 1 {
		t.Fatalf("expected failed trigger to increment run count, got %d", statuses[0].RunCount)
	}
	if statuses[0].LastError == "" {
		t.Fatal("expected failed trigger to record last error")
	}
}

func TestStatusChangeCallbackCanQuerySchedulerState(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}

	callbackDone := make(chan struct{})
	var once sync.Once
	sc.OnStatusChange = func(_ bool, _ []ScheduleStatus) {
		once.Do(func() { close(callbackDone) })
	}

	triggerDone := make(chan error, 1)
	go func() {
		_, err := sc.Trigger(0)
		triggerDone <- err
	}()

	select {
	case err := <-triggerDone:
		if err != nil {
			t.Fatalf("trigger returned error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("trigger deadlocked while dispatching status change")
	}

	select {
	case <-callbackDone:
	case <-time.After(time.Second):
		t.Fatal("status change callback was not called")
	}
}

func TestReloadRecoversAfterConfigError(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	t.Cleanup(sc.Stop)

	sc.Start()
	if !sc.IsRunning() {
		t.Fatal("expected scheduler to be running after Start")
	}

	if err := os.WriteFile(configPath, []byte("schedules:\n  - type: ["), 0600); err != nil {
		t.Fatalf("write invalid config: %v", err)
	}

	if err := sc.Reload(); err == nil {
		t.Fatal("expected Reload to return error for invalid config")
	}

	if !sc.IsRunning() {
		t.Fatal("expected scheduler to recover and remain running after config error")
	}

	statuses := sc.GetStatuses()
	if len(statuses) != 1 {
		t.Fatalf("expected existing statuses to be preserved after reload failure, got %d", len(statuses))
	}
}

func TestStopAfterReloadRecoverDoesNotHang(t *testing.T) {
	// 验证 Reload 失败→恢复后，Stop 能正常完成，不会因 context.Background()
	// 导致 goroutine 永不退出。
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	sc.Start()

	// 模拟 Reload 失败并恢复
	if err := os.WriteFile(configPath, []byte("schedules:\n  - type: ["), 0600); err != nil {
		t.Fatalf("write invalid config: %v", err)
	}
	if err := sc.Reload(); err == nil {
		t.Fatal("expected Reload to return error")
	}

	// 验证 Stop 在 5s 内完成（不 hang）
	stopDone := make(chan struct{})
	go func() {
		sc.Stop()
		close(stopDone)
	}()
	select {
	case <-stopDone:
	case <-time.After(5 * time.Second):
		t.Fatal("Stop hung after Reload recovery - goroutine may have context.Background()")
	}
}

func TestValidateEntryRejectsZeroListID(t *testing.T) {
	err := ValidateEntry(ScheduleEntry{
		Type:     ScheduleTypeList,
		Target:   "0",
		Schedule: "interval:1h",
		Enabled:  true,
	})
	if err == nil {
		t.Fatal("expected list target 0 to be invalid")
	}
}

func TestValidateEntryMixedRejectsEmptyTargets(t *testing.T) {
	err := ValidateEntry(ScheduleEntry{
		Type:     ScheduleTypeMixed,
		Schedule: "interval:1h",
		Enabled:  true,
	})
	if err == nil {
		t.Fatal("expected mixed entry without targets to be invalid")
	}
}

func TestValidateEntryMixedRejectsInvalidScreenName(t *testing.T) {
	err := ValidateEntry(ScheduleEntry{
		Type:     ScheduleTypeMixed,
		Users:    []string{"bad-name"},
		Schedule: "interval:1h",
		Enabled:  true,
	})
	if err == nil {
		t.Fatal("expected invalid mixed screen name to be rejected")
	}
}

func TestValidateEntryMixedRejectsZeroListID(t *testing.T) {
	err := ValidateEntry(ScheduleEntry{
		Type:     ScheduleTypeMixed,
		Lists:    []string{"0"},
		Schedule: "interval:1h",
		Enabled:  true,
	})
	if err == nil {
		t.Fatal("expected mixed list id 0 to be rejected")
	}
}

func TestValidateEntryMixedAcceptsAtPrefixedScreenName(t *testing.T) {
	err := ValidateEntry(ScheduleEntry{
		Type:           ScheduleTypeMixed,
		Users:          []string{"@alice"},
		FollowingNames: []string{" @bob "},
		Schedule:       "interval:1h",
		Enabled:        true,
	})
	if err != nil {
		t.Fatalf("expected at-prefixed names to be accepted after canonicalization: %v", err)
	}
}

func TestNormalizeEntriesAssignsStableUniqueIDs(t *testing.T) {
	entries, err := NormalizeEntries([]ScheduleEntry{
		{Type: ScheduleTypeUser, Target: "alice", Name: "Alice", Schedule: "interval:1h", Enabled: true},
		{Type: ScheduleTypeUser, Target: "alice", Name: "Alice", Schedule: "interval:1h", Enabled: true},
	})
	if err != nil {
		t.Fatalf("normalize entries: %v", err)
	}
	if entries[0].ID == "" || entries[1].ID == "" {
		t.Fatalf("expected generated ids, got %q and %q", entries[0].ID, entries[1].ID)
	}
	if entries[0].ID == entries[1].ID {
		t.Fatalf("expected duplicate entries to receive unique ids, got %q", entries[0].ID)
	}
}

func TestNormalizeEntriesMixedCanonicalizesBeforeID(t *testing.T) {
	entries, err := NormalizeEntries([]ScheduleEntry{
		{Type: ScheduleTypeMixed, Users: []string{" @alice "}, Schedule: "interval:1h", Enabled: true},
	})
	if err != nil {
		t.Fatalf("normalize entries: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d", len(entries))
	}
	if got := entries[0].Users; len(got) != 1 || got[0] != "alice" {
		t.Fatalf("expected canonicalized mixed users, got %#v", got)
	}
	if entries[0].Target != "" {
		t.Fatalf("expected mixed target to be cleared, got %q", entries[0].Target)
	}
}

func TestNormalizeEntriesNonMixedClearsMixedArrays(t *testing.T) {
	entries, err := NormalizeEntries([]ScheduleEntry{
		{
			Type:           ScheduleTypeUser,
			Target:         "alice",
			Users:          []string{"bob"},
			Lists:          []string{"123"},
			FollowingNames: []string{"charlie"},
			Schedule:       "interval:1h",
			Enabled:        true,
		},
	})
	if err != nil {
		t.Fatalf("normalize entries: %v", err)
	}
	if entries[0].Users != nil || entries[0].Lists != nil || entries[0].FollowingNames != nil {
		t.Fatalf("expected non-mixed entry to clear mixed arrays, got %#v", entries[0])
	}
}

func TestScheduleIDBaseMixedNoGroupCollision(t *testing.T) {
	a := scheduleIDBase(ScheduleEntry{
		Type:     ScheduleTypeMixed,
		Users:    []string{"alice"},
		Lists:    []string{"123"},
		Schedule: "interval:1h",
		Enabled:  true,
	})
	b := scheduleIDBase(ScheduleEntry{
		Type:     ScheduleTypeMixed,
		Users:    []string{"123"},
		Lists:    []string{"alice"},
		Schedule: "interval:1h",
		Enabled:  true,
	})
	if a == b {
		t.Fatalf("expected mixed schedule id base to distinguish target groups, got %q", a)
	}
}

func TestNewEntryIDMixedCanonicalStable(t *testing.T) {
	a := NewEntryID(ScheduleEntry{
		Type:     ScheduleTypeMixed,
		Users:    []string{"@Alice"},
		Schedule: "interval:1h",
		Enabled:  true,
	}, nil)
	b := NewEntryID(ScheduleEntry{
		Type:     ScheduleTypeMixed,
		Users:    []string{" Alice "},
		Schedule: "interval:1h",
		Enabled:  true,
	}, nil)
	if a != b {
		t.Fatalf("expected canonical mixed entry ids to match, got %q and %q", a, b)
	}
}

func TestNormalizeEntriesRejectsDuplicateExplicitIDs(t *testing.T) {
	_, err := NormalizeEntries([]ScheduleEntry{
		{ID: "same", Type: ScheduleTypeUser, Target: "alice", Schedule: "interval:1h", Enabled: true},
		{ID: "same", Type: ScheduleTypeUser, Target: "bob", Schedule: "interval:1h", Enabled: true},
	})
	if err == nil {
		t.Fatal("expected duplicate explicit ids to be rejected")
	}
}

func TestParseScheduleTrimsValues(t *testing.T) {
	interval, err := ParseSchedule("interval: 2h")
	if err != nil {
		t.Fatalf("parse interval: %v", err)
	}
	if interval.Interval != 2*time.Hour {
		t.Fatalf("expected 2h interval, got %s", interval.Interval)
	}

	daily, err := ParseSchedule("daily: 07:00, 21:00")
	if err != nil {
		t.Fatalf("parse daily: %v", err)
	}
	if len(daily.Times) != 2 {
		t.Fatalf("expected two daily times, got %d", len(daily.Times))
	}
}

func TestParseSchedulePreservesDisplayOrderAndSortsTriggerTimes(t *testing.T) {
	daily, err := ParseSchedule("daily: 21:00, 07:00")
	if err != nil {
		t.Fatalf("parse daily: %v", err)
	}

	if got := FormatScheduleDisplay(daily, ""); got != "每天 21:00, 07:00" {
		t.Fatalf("expected display order to match config, got %q", got)
	}
	if len(daily.SortedTimes) != 2 {
		t.Fatalf("expected two sorted times, got %d", len(daily.SortedTimes))
	}
	if got := daily.SortedTimes[0].Format("15:04"); got != "07:00" {
		t.Fatalf("expected first sorted time to be 07:00, got %s", got)
	}
	if got := daily.SortedTimes[1].Format("15:04"); got != "21:00" {
		t.Fatalf("expected second sorted time to be 21:00, got %s", got)
	}
}

func TestParseScheduleRejectsTooManyDailyTimes(t *testing.T) {
	// 97 time points - one over the 96 limit
	times := make([]string, 97)
	for i := range times {
		times[i] = fmt.Sprintf("%02d:%02d", i/60, i%60)
	}
	schedule := "daily:" + strings.Join(times, ",")
	_, err := ParseSchedule(schedule)
	if err == nil {
		t.Fatal("expected error for too many daily times, got nil")
	}
	if !strings.Contains(err.Error(), "too many daily times") {
		t.Fatalf("expected 'too many daily times' error, got: %v", err)
	}
}

func TestParseScheduleAcceptsMaxDailyTimes(t *testing.T) {
	// exactly 96 time points should succeed
	var times []string
	for h := 0; h < 24; h++ {
		for m := 0; m < 60; m += 15 {
			times = append(times, fmt.Sprintf("%02d:%02d", h, m))
		}
	}
	schedule := "daily:" + strings.Join(times, ",")
	parsed, err := ParseSchedule(schedule)
	if err != nil {
		t.Fatalf("expected 96 daily times to be accepted, got: %v", err)
	}
	if len(parsed.Times) != 96 {
		t.Fatalf("expected 96 times, got %d", len(parsed.Times))
	}
}

func TestRunLoopExitsOnInvalidIndex(t *testing.T) {
	sc := &Scheduler{
		downloadFunc: func(ScheduleEntry) (string, error) {
			t.Fatal("downloadFunc should not be called for invalid runLoop index")
			return "", nil
		},
		entries: []ScheduleEntry{{
			Type:     ScheduleTypeUser,
			Target:   "alice",
			Name:     "Alice",
			Schedule: "interval:1h",
			Enabled:  true,
		}},
		parsed: nil,
	}

	sc.runLoop(0)
	sc.runLoop(1)
}

func TestNextDailyTriggerAt_EmptyTimes(t *testing.T) {
	now := time.Date(2026, time.August, 14, 12, 0, 0, 0, time.Local)
	got := nextDailyTriggerAt(now, []time.Time{})
	if !got.IsZero() {
		t.Errorf("expected zero time, got %v", got)
	}
}

func TestNextDailyTriggerAt_ReturnsTodayIfTimeHasNotPassed(t *testing.T) {
	location := time.FixedZone("UTC+8", 8*60*60)
	now := time.Date(2026, time.August, 14, 12, 0, 0, 0, location)
	trigger := time.Date(2000, time.January, 1, 12, 5, 0, 0, location)

	got := nextDailyTriggerAt(now, []time.Time{trigger})
	want := time.Date(2026, time.August, 14, 12, 5, 0, 0, location)
	if !got.Equal(want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

func TestNextDailyTriggerAt_ReturnsTomorrowWhenAllTimesPassed(t *testing.T) {
	location := time.FixedZone("UTC+8", 8*60*60)
	now := time.Date(2026, time.August, 14, 12, 0, 0, 0, location)
	past := time.Date(2000, time.January, 1, 11, 0, 0, 0, location)

	got := nextDailyTriggerAt(now, []time.Time{past})
	want := time.Date(2026, time.August, 15, 11, 0, 0, 0, location)
	if !got.Equal(want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

func TestNextDailyTriggerAt_SelectsNextTimeWhenMultiple(t *testing.T) {
	location := time.FixedZone("UTC+8", 8*60*60)
	now := time.Date(2026, time.August, 14, 12, 0, 0, 0, location)
	inFiveMinutes := time.Date(2000, time.January, 1, 12, 5, 0, 0, location)
	inThirtyMinutes := time.Date(2000, time.January, 1, 12, 30, 0, 0, location)

	got := nextDailyTriggerAt(now, []time.Time{inFiveMinutes, inThirtyMinutes})
	want := time.Date(2026, time.August, 14, 12, 5, 0, 0, location)
	if !got.Equal(want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

func TestNextDailyTriggerAt_ReturnsTomorrowAtExactTime(t *testing.T) {
	location := time.FixedZone("UTC+8", 8*60*60)
	now := time.Date(2026, time.August, 14, 12, 0, 0, 0, location)
	trigger := time.Date(2000, time.January, 1, 12, 0, 0, 0, location)

	got := nextDailyTriggerAt(now, []time.Time{trigger})
	want := time.Date(2026, time.August, 15, 12, 0, 0, 0, location)
	if !got.Equal(want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

// TestValidateEntryListRejectsAtPrefixedTarget 守护 list 目标不剥 @：
// "@123" 不是合法数字 ID，必须拒绝（旧行为）；user/following 才允许 @ 前缀。
func TestValidateEntryListRejectsAtPrefixedTarget(t *testing.T) {
	if err := ValidateEntry(ScheduleEntry{Type: ScheduleTypeList, Target: "@123"}); err == nil {
		t.Fatal("expected list target @123 to be invalid (list IDs are numeric)")
	}
	if err := ValidateEntry(ScheduleEntry{Type: ScheduleTypeUser, Target: "@alice"}); err != nil {
		t.Fatalf("user target with @ prefix should be normalized and accepted, got %v", err)
	}
}

// TestTriggerConcurrentSameEntryRejected 守护 Triggering 防重入 guard：
// downloadFunc 阻塞期间，对同一 entry 的第二次 Trigger 必须被拒绝
// （ErrScheduleAlreadyTriggering），且首次触发完成后 Triggering 释放。
func TestTriggerConcurrentSameEntryRejected(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "schedules.yaml")
	if err := os.WriteFile(configPath, []byte(`schedules:
  - type: user
    target: alice
    name: Alice
    schedule: "interval:1h"
    enabled: true
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	started := make(chan struct{})
	release := make(chan struct{})
	sc, err := New(configPath, func(entry ScheduleEntry) (string, error) {
		close(started)
		<-release
		return "task-1", nil
	})
	if err != nil {
		t.Fatalf("new scheduler: %v", err)
	}
	t.Cleanup(sc.Stop)

	firstDone := make(chan struct{})
	go func() {
		defer close(firstDone)
		_, _ = sc.Trigger(0)
	}()

	<-started // downloadFunc 已进入阻塞
	_, secondErr := sc.Trigger(0)
	if !errors.Is(secondErr, ErrScheduleAlreadyTriggering) {
		t.Fatalf("second concurrent trigger: expected ErrScheduleAlreadyTriggering, got %v", secondErr)
	}

	close(release)
	<-firstDone

	statuses := sc.GetStatuses()
	if len(statuses) != 1 {
		t.Fatalf("expected one status, got %d", len(statuses))
	}
	if statuses[0].Triggering {
		t.Fatal("expected Triggering to be released after the first trigger completed")
	}
	if statuses[0].LastTaskID != "task-1" {
		t.Fatalf("expected first trigger result recorded, got %q", statuses[0].LastTaskID)
	}
}

// TestFormatScheduleDisplayKeepsMinutesWhenDaysPresent 守护 T1 修复：
// interval 天数>0 且含分钟时，展示不能丢分钟（24h30m → "每 1 天 30 分钟"）。
func TestFormatScheduleDisplayKeepsMinutesWhenDaysPresent(t *testing.T) {
	tests := []struct {
		interval time.Duration
		want     string
	}{
		{24 * time.Hour, "每 24 小时"},
		{24*time.Hour + 30*time.Minute, "每 1 天 30 分钟"},
		{49*time.Hour + 30*time.Minute, "每 2 天 1 小时 30 分钟"},
		{25*time.Hour + 5*time.Minute, "每 1 天 1 小时 5 分钟"},
	}
	for _, tt := range tests {
		got := FormatScheduleDisplay(&ParsedSchedule{Mode: ScheduleModeInterval, Interval: tt.interval}, "")
		if got != tt.want {
			t.Errorf("FormatScheduleDisplay(%v) = %q, want %q", tt.interval, got, tt.want)
		}
	}
}

// TestNextDailyTriggerAtRollsToNextDayEarliestTime 守护 daily 的跨天语义：
// 今天的候选时间点全部过去后，下一次必须是「次日最早的时间点」，而不是
// 输入顺序里的第一个（配置顺序不可信）也不是直接 +24h（跨月/跨年必须进位）。
func TestNextDailyTriggerAtRollsToNextDayEarliestTime(t *testing.T) {
	location := time.FixedZone("UTC+8", 8*60*60)
	times := []time.Time{
		time.Date(2000, time.January, 1, 6, 0, 0, 0, location),
		time.Date(2000, time.January, 1, 12, 30, 0, 0, location),
		time.Date(2000, time.January, 1, 21, 0, 0, 0, location),
	}

	tests := []struct {
		name string
		now  time.Time
		want time.Time
	}{
		{
			name: "late evening rolls to tomorrow's first slot",
			now:  time.Date(2026, time.August, 14, 23, 59, 0, 0, location),
			want: time.Date(2026, time.August, 15, 6, 0, 0, 0, location),
		},
		{
			name: "just after the last slot rolls to tomorrow's first slot",
			now:  time.Date(2026, time.August, 14, 21, 0, 0, 0, location),
			want: time.Date(2026, time.August, 15, 6, 0, 0, 0, location),
		},
		{
			name: "year boundary",
			now:  time.Date(2026, time.December, 31, 23, 30, 0, 0, location),
			want: time.Date(2027, time.January, 1, 6, 0, 0, 0, location),
		},
		{
			name: "month boundary",
			now:  time.Date(2026, time.February, 28, 22, 0, 0, 0, location),
			want: time.Date(2026, time.March, 1, 6, 0, 0, 0, location),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nextDailyTriggerAt(tt.now, times)
			if !got.Equal(tt.want) {
				t.Errorf("nextDailyTriggerAt(%v) = %v, want %v", tt.now, got, tt.want)
			}
			if !got.After(tt.now) {
				t.Errorf("next trigger %v must be after now %v", got, tt.now)
			}
		})
	}
}

// TestRandomIntervalDelayStaysInsideInterval 守护 interval 模式首次触发的
// 下界：首次延迟必须严格大于 0（不早于 now）且小于 interval，同一 entry
// 每次算出相同延迟（重启后不漂移），空 ID 的回退分支同样落在区间内。
func TestRandomIntervalDelayStaysInsideInterval(t *testing.T) {
	const interval = time.Hour

	for _, id := range []string{"entry-alpha", "entry-beta", "0", "list:12345"} {
		delay := randomIntervalDelay(interval, id)
		if delay <= 0 || delay >= interval {
			t.Errorf("randomIntervalDelay(%v, %q) = %v, want 0 < delay < %v", interval, id, delay, interval)
		}
		if again := randomIntervalDelay(interval, id); again != delay {
			t.Errorf("randomIntervalDelay(%v, %q) is not stable: %v then %v", interval, id, delay, again)
		}
		now := time.Now()
		if !now.Add(delay).After(now) {
			t.Errorf("first run at now+delay must be after now (delay=%v)", delay)
		}
	}

	// 无 ID 的回退分支（测试配置等）同样不得产生零延迟。
	for range 32 {
		delay := randomIntervalDelay(interval, "")
		if delay <= 0 || delay >= interval {
			t.Errorf("randomIntervalDelay(%v, \"\") = %v, want 0 < delay < %v", interval, delay, interval)
		}
	}

	// 极短 interval 直接原样返回，不 panic（除零防护）。
	if got := randomIntervalDelay(time.Nanosecond, "entry-alpha"); got != time.Nanosecond {
		t.Errorf("randomIntervalDelay(1ns) = %v, want 1ns", got)
	}
}

// TestRandomIntervalDelayNeverReturnsZero 用极小 interval 放大取模结果，
// 逼出 0 延迟边界：哈希取模命中 0 时必须被抬到 1ns，否则"先延迟再执行"
// 的语义退化成启动即执行（run_on_start=false 也会立刻跑）。
func TestRandomIntervalDelayNeverReturnsZero(t *testing.T) {
	const interval = 4 * time.Nanosecond

	// 确定性重算：延迟 = 哈希取模，命中 0 时抬到 1ns。
	expected := func(entryID string) time.Duration {
		h := fnv.New64a()
		_, _ = h.Write([]byte(entryID))
		pos := h.Sum64() % uint64(interval)
		if pos == 0 {
			pos = 1
		}
		return time.Duration(pos)
	}

	zeroModuloSamples := 0
	for i := range 256 {
		entryID := fmt.Sprintf("synthetic-%d", i)
		h := fnv.New64a()
		_, _ = h.Write([]byte(entryID))
		if h.Sum64()%uint64(interval) == 0 {
			zeroModuloSamples++
		}

		got := randomIntervalDelay(interval, entryID)
		if got != expected(entryID) {
			t.Fatalf("randomIntervalDelay(%v, %s) = %v, want %v", interval, entryID, got, expected(entryID))
		}
		if got <= 0 || got >= interval {
			t.Fatalf("randomIntervalDelay(%v, %s) = %v, want 0 < delay < %v", interval, entryID, got, interval)
		}
	}

	// 采样中必须真的出现取模为 0 的 entry，否则上面的断言没触及该边界。
	if zeroModuloSamples == 0 {
		t.Fatal("test did not sample any entry whose hash hits modulo zero")
	}
}
