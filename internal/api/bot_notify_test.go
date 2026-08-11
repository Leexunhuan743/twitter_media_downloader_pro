package api

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/unkmonster/tmd/internal/consolelog"
)

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

func TestRunBotLogLoopResubscribesAfterOverflow(t *testing.T) {
	hub := consolelog.NewHub(10)
	stopCh := make(chan struct{})
	var workers sync.WaitGroup
	firstAlertStarted := make(chan struct{})
	releaseFirstAlert := make(chan struct{})
	recovered := make(chan string, 1)
	callCount := 0
	var callsMu sync.Mutex

	RunBotLogLoop(hub, stopCh, &workers, func(line string) {
		callsMu.Lock()
		callCount++
		current := callCount
		callsMu.Unlock()
		if current == 1 {
			close(firstAlertStarted)
			<-releaseFirstAlert
			return
		}
		select {
		case recovered <- line:
		default:
		}
	})

	startDeadline := time.NewTimer(time.Second)
	startTicker := time.NewTicker(10 * time.Millisecond)
	for waiting := true; waiting; {
		hub.Add("ERRO[2026-08-09T00:00:00Z] first")
		select {
		case <-firstAlertStarted:
			waiting = false
		case <-startTicker.C:
		case <-startDeadline.C:
			startTicker.Stop()
			t.Fatal("first alert callback did not start")
		}
	}
	startDeadline.Stop()
	startTicker.Stop()
	for i := 0; i < 150; i++ {
		hub.Add(fmt.Sprintf("INFO[2026-08-09T00:00:00Z] queued-%d", i))
	}
	close(releaseFirstAlert)

	deadline := time.NewTimer(3 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()
	for {
		select {
		case line := <-recovered:
			if line != "ERRO[2026-08-09T00:00:00Z] recovered" {
				t.Fatalf("unexpected recovered alert %q", line)
			}
			close(stopCh)
			workers.Wait()
			return
		case <-ticker.C:
			hub.Add("ERRO[2026-08-09T00:00:00Z] recovered")
		case <-deadline.C:
			close(stopCh)
			workers.Wait()
			t.Fatal("log loop did not recover after subscriber overflow")
		}
	}
}
