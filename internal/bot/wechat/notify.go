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
	b.mu.Lock()
	var notifications []notification
	for _, task := range tasks {
		if task.Status != api.TaskStatusCompleted && task.Status != api.TaskStatusFailed {
			continue
		}
		text := api.FormatTaskResult(task, false)
		for userID, taskIDs := range b.userTasks {
			if _, ok := taskIDs[task.ID]; !ok {
				continue
			}
			delete(taskIDs, task.ID)
			if len(taskIDs) == 0 {
				delete(b.userTasks, userID)
			}
			notifications = append(notifications, notification{userID: userID, text: text})
		}
	}
	b.mu.Unlock()

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
