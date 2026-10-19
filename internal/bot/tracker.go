package bot

import "sync"

// TaskTracker 记录每个会话（chat/channel/user）提交过、尚未通知完成的任务。
// 各平台适配器用它替代各自维护的三层 map，行为保持一致：
// Track 记录提交，Drain 在收到终态任务时取出并清理对应会话。
type TaskTracker struct {
	mu     sync.Mutex
	scopes map[string]map[string]struct{}
}

// NewTaskTracker 创建空的追踪器。
func NewTaskTracker() *TaskTracker {
	return &TaskTracker{scopes: make(map[string]map[string]struct{})}
}

// Track 记录 scope 提交了 taskID。空 scope 或 taskID 会被忽略。
func (t *TaskTracker) Track(scope, taskID string) {
	if t == nil || scope == "" || taskID == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.scopes == nil {
		t.scopes = make(map[string]map[string]struct{})
	}
	ids := t.scopes[scope]
	if ids == nil {
		ids = make(map[string]struct{})
		t.scopes[scope] = ids
	}
	ids[taskID] = struct{}{}
}

// Drain 移除所有正在跟踪 taskID 的 scope 并返回它们。
func (t *TaskTracker) Drain(taskID string) []string {
	if t == nil || taskID == "" {
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	var scopes []string
	for scope, ids := range t.scopes {
		if _, ok := ids[taskID]; !ok {
			continue
		}
		delete(ids, taskID)
		if len(ids) == 0 {
			delete(t.scopes, scope)
		}
		scopes = append(scopes, scope)
	}
	return scopes
}

// Pending 返回 scope 中仍在等待通知的任务数。
func (t *TaskTracker) Pending(scope string) int {
	if t == nil {
		return 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.scopes[scope])
}

// Scopes 返回当前正在跟踪的会话数。
func (t *TaskTracker) Scopes() int {
	if t == nil {
		return 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.scopes)
}
