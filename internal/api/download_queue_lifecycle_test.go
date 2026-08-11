package api

import (
	"sync"
	"testing"
	"time"
)

func TestDownloadQueueCloseAndWaitUsesOneTimeoutBudget(t *testing.T) {
	workerDone := make(chan struct{})
	queue := &DownloadQueue{
		workerDone: workerDone,
		detached:   make(map[string]*detachedRun),
	}
	queue.cond = sync.NewCond(&queue.mu)
	queue.detachedWG.Add(1)
	t.Cleanup(func() {
		close(workerDone)
		queue.detachedWG.Done()
	})

	const budget = 100 * time.Millisecond
	startedAt := time.Now()
	queue.CloseAndWait(budget)
	elapsed := time.Since(startedAt)

	if elapsed >= budget*2 {
		t.Fatalf("queue consumed the timeout budget more than once: budget=%s elapsed=%s", budget, elapsed)
	}
}
