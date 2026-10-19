package wechat

import (
	"context"

	"github.com/unkmonster/tmd/internal/api"
)

func (b *Bot) notifyTaskChanges(data interface{}) {
	tasks, ok := data.([]*api.Task)
	if !ok {
		return
	}
	type notification struct {
		userID string
		text   string
	}
	var notifications []notification
	for _, task := range tasks {
		terminal := task.Status == api.TaskStatusCompleted || task.Status == api.TaskStatusFailed
		// 取消的任务不发通知，但同样要从追踪表里取出，避免条目永久留在内存里。
		if !terminal && task.Status != api.TaskStatusCancelled {
			continue
		}
		scopes := b.tracker.Drain(task.ID)
		if !terminal {
			continue
		}
		text := api.FormatTaskResult(task, false)
		for _, userID := range scopes {
			notifications = append(notifications, notification{userID: userID, text: text})
		}
	}

	for _, n := range notifications {
		ctx := context.Background()
		b.sendText(ctx, n.userID, n.text)
	}
}

func (b *Bot) sendLogAlert(line string) {
	b.mu.Lock()
	userIDs := make([]string, 0, len(b.userTokens))
	for uid := range b.userTokens {
		userIDs = append(userIDs, uid)
	}
	b.mu.Unlock()

	for _, userID := range userIDs {
		ctx := context.Background()
		b.sendText(ctx, userID, "🔴 "+line)
	}
}
