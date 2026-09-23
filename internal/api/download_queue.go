package api

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/service"
)

const downloadCancelGrace = 10 * time.Second

type downloadJob struct {
	task   *Task
	taskID string
	run    func(ctx context.Context, taskID string, reporter service.ProgressReporter) error
	keys   []targetKey
	// discard 在该任务的 run 永远不会执行时调用（排队中被取消、关停被丢弃），
	// 用于回收只有 run 才会清理的临时资源（例如上传的 JSON 临时目录）。
	discard func()
}

type detachedRun struct {
	taskID    string
	startedAt time.Time
	keys      []targetKey
}

type DownloadQueue struct {
	server      *Server
	cancelGrace time.Duration

	mu          sync.Mutex
	cond        *sync.Cond
	pending     []*downloadJob
	heldTargets map[targetKey]string
	detached    map[string]*detachedRun
	closed      bool

	workerDone chan struct{}
	detachedWG sync.WaitGroup
}

func NewDownloadQueue(server *Server) *DownloadQueue {
	q := &DownloadQueue{
		server:      server,
		cancelGrace: downloadCancelGrace,
		pending:     make([]*downloadJob, 0),
		heldTargets: make(map[targetKey]string),
		detached:    make(map[string]*detachedRun),
		workerDone:  make(chan struct{}),
	}
	q.cond = sync.NewCond(&q.mu)
	go q.workerLoop()
	return q
}

// ErrQueueClosed 表示下载队列已关闭，拒绝新任务入队（关停 TOCTOU 防护：
// 调用方必须把被拒绝的任务转为终态，而不是让 HTTP/Bot/Scheduler 收到
// "已排队"但永不执行的假成功）。
var ErrQueueClosed = errors.New("download queue is closed")

func (q *DownloadQueue) Enqueue(task *Task, run func(ctx context.Context, taskID string, reporter service.ProgressReporter) error) error {
	return q.EnqueueWithDiscard(task, run, nil)
}

// EnqueueWithDiscard 与 Enqueue 相同，但额外登记一个"永不执行"回调：
// 任务在排队期间被取消、或关停时被丢弃（run 不会跑）时会调用它，
// 避免只有 run 才负责的临时资源泄漏。
func (q *DownloadQueue) EnqueueWithDiscard(task *Task, run func(ctx context.Context, taskID string, reporter service.ProgressReporter) error, discard func()) error {
	if task == nil || run == nil {
		return errors.New("download queue: nil task or run function")
	}

	job := &downloadJob{
		task:    task,
		taskID:  task.ID,
		run:     run,
		keys:    taskTargetKeys(task),
		discard: discard,
	}

	q.mu.Lock()
	if q.closed {
		q.mu.Unlock()
		return fmt.Errorf("%w: task %s rejected during shutdown", ErrQueueClosed, task.ID)
	}
	q.pending = append(q.pending, job)
	depth := len(q.pending)
	q.mu.Unlock()
	logQueueEnqueued(task, depth)
	q.cond.Signal()
	return nil
}

// Wakeup 唤醒可能正在 cond.Wait 上休眠的 worker，用于任务取消后让 worker 检查清理。
func (q *DownloadQueue) Wakeup() {
	q.cond.Signal()
}

func (q *DownloadQueue) CloseAndWait(timeout time.Duration) {
	q.mu.Lock()
	if q.closed {
		q.mu.Unlock()
		return
	}
	q.closed = true
	q.mu.Unlock()
	q.cond.Broadcast()

	if timeout <= 0 {
		<-q.workerDone
		q.detachedWG.Wait()
		return
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-q.workerDone:
	case <-timer.C:
		log.Warnf("[download-queue] Worker exit timeout timeout=%s", timeout)
		return
	}

	detachedDone := make(chan struct{})
	go func() {
		q.detachedWG.Wait()
		close(detachedDone)
	}()
	select {
	case <-detachedDone:
	case <-timer.C:
		log.Warnf("[download-queue] Detached runs active timeout=%s", timeout)
	}
}

func (q *DownloadQueue) workerLoop() {
	defer close(q.workerDone)
	for {
		job := q.nextJob()
		if job == nil {
			return
		}
		q.executeJob(job)
	}
}

func (q *DownloadQueue) nextJob() *downloadJob {
	q.mu.Lock()
	defer q.mu.Unlock()

	for {
		idx, job := q.nextRunnableLocked()
		if job != nil {
			q.pending = append(q.pending[:idx], q.pending[idx+1:]...)
			for _, key := range job.keys {
				q.heldTargets[key] = job.taskID
			}
			return job
		}
		// nextRunnableLocked 已丢弃失效（已取消/非 queued）条目，因此排空判定
		// 必须放在它之后：否则关停时 pending 只剩已取消任务、worker 会在
		// Wait 上永久睡死（Enqueue 已拒绝新任务，不会再有 Broadcast），
		// workerDone 不再关闭，关停只能等满整个预算。
		if q.closed && len(q.pending) == 0 {
			return nil
		}
		q.cond.Wait()
	}
}

func (q *DownloadQueue) nextRunnableLocked() (int, *downloadJob) {
	q.cleanupStaleTargetsLocked()

	for i := 0; i < len(q.pending); {
		job := q.pending[i]
		snapshot, ok := q.server.taskManager.GetTask(job.taskID)
		if !ok || snapshot.Status != TaskStatusQueued {
			// 该任务的 run 永远不会执行：回收只有 run 负责的临时资源。
			// 在锁内同步执行是有意的——调用方（workerLoop）退出后
			// CloseAndWait 会等 workerDone，这样回收一定在关停完成前结束。
			if job.discard != nil {
				job.discard()
			}
			// 用 copy + 置空尾部槽位删除，避免 backing array 继续持有已丢弃
			// job 的指针（append(s[:i], s[i+1:]...) 会把最后一个元素复制一份
			// 留在尾部槽位里）。
			copy(q.pending[i:], q.pending[i+1:])
			q.pending[len(q.pending)-1] = nil
			q.pending = q.pending[:len(q.pending)-1]
			continue
		}
		if q.conflictsLocked(job.keys) {
			i++
			continue
		}
		return i, job
	}
	return -1, nil
}

func (q *DownloadQueue) conflictsLocked(keys []targetKey) bool {
	for _, incoming := range keys {
		for held := range q.heldTargets {
			if targetsConflict(incoming, held) {
				return true
			}
		}
	}
	return false
}

func (q *DownloadQueue) cleanupStaleTargetsLocked() {
	for key, ownerID := range q.heldTargets {
		if _, ok := q.detached[ownerID]; ok {
			continue
		}
		snapshot, ok := q.server.taskManager.GetTask(ownerID)
		if !ok || isTerminalStatus(snapshot.Status) {
			delete(q.heldTargets, key)
		}
	}
}

func (q *DownloadQueue) executeJob(job *downloadJob) {
	if !q.server.taskManager.UpdateTaskStatus(job.taskID, TaskStatusRunning) {
		q.releaseTargets(job.taskID)
		return
	}

	reporter := NewSSEProgressReporter(q.server)
	done := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Errorf("[download-queue] Task panic task_id=%s error=%q", job.taskID, fmt.Sprint(r))
				done <- fmt.Errorf("download task panic: %v", r)
			}
		}()
		done <- job.run(job.task.Ctx, job.taskID, reporter)
	}()

	select {
	case err := <-done:
		q.finishJob(job, err)
	case <-job.task.Ctx.Done():
		timer := time.NewTimer(q.cancelGrace)
		defer timer.Stop()
		select {
		case err := <-done:
			q.finishJob(job, err)
		case <-timer.C:
			q.detachJob(job, done)
		}
	}
}

func (q *DownloadQueue) finishJob(job *downloadJob, err error) {
	q.handleRunResult(job.taskID, err)
	q.releaseTargets(job.taskID)
}

func (q *DownloadQueue) detachJob(job *downloadJob, done <-chan error) {
	q.mu.Lock()
	q.detached[job.taskID] = &detachedRun{
		taskID:    job.taskID,
		startedAt: time.Now(),
		keys:      append([]targetKey(nil), job.keys...),
	}
	q.mu.Unlock()
	logQueueDetached(job.taskID, q.cancelGrace)

	q.detachedWG.Add(1)
	go func() {
		defer q.detachedWG.Done()
		err := <-done
		q.mu.Lock()
		if q.closed {
			delete(q.detached, job.taskID)
			q.mu.Unlock()
			q.releaseTargets(job.taskID)
			return
		}
		q.mu.Unlock()
		q.handleRunResult(job.taskID, err)
		q.mu.Lock()
		delete(q.detached, job.taskID)
		q.mu.Unlock()
		q.releaseTargets(job.taskID)
	}()
}

func (q *DownloadQueue) handleRunResult(taskID string, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return
	}
	taskSnapshot, ok := q.server.taskManager.GetTask(taskID)
	if !ok || isTerminalStatus(taskSnapshot.Status) {
		return
	}
	q.server.taskManager.SetTaskError(taskID, err)
}

func (q *DownloadQueue) releaseTargets(taskID string) {
	q.mu.Lock()
	for key, owner := range q.heldTargets {
		if owner == taskID {
			delete(q.heldTargets, key)
		}
	}
	q.mu.Unlock()
	q.cond.Broadcast()
}

// Status 返回队列状态
func (q *DownloadQueue) Status() (int, int, int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.pending), len(q.heldTargets), len(q.detached)
}
