package telegram

import (
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
)

func (b *Bot) notifyTaskChanges(data interface{}) {
	tasks, ok := data.([]*api.Task)
	if !ok {
		return
	}
	type notification struct {
		chatID int64
		text   string
	}
	b.mu.Lock()
	var notifications []notification
	for _, task := range tasks {
		if task.Status != api.TaskStatusCompleted && task.Status != api.TaskStatusFailed {
			continue
		}
		for chatID, taskIDs := range b.chatTasks {
			if _, ok := taskIDs[task.ID]; !ok {
				continue
			}
			delete(taskIDs, task.ID)
			if len(taskIDs) == 0 {
				delete(b.chatTasks, chatID)
			}
			notifications = append(notifications, notification{chatID: chatID, text: api.FormatTaskResult(task, true)})
		}
	}
	b.mu.Unlock()

	for _, n := range notifications {
		msg := tgbotapi.NewMessage(n.chatID, n.text)
		msg.ParseMode = "markdown"
		if _, err := b.api.Send(msg); err != nil {
			log.Warnf("[bot-telegram] Send notification failed chat_id=%d error=%q", n.chatID, err.Error())
		}
	}
}

func (b *Bot) sendLogAlert(line string) {
	for _, chatID := range b.config.AllowedUsers {
		msg := tgbotapi.NewMessage(chatID, "🔴 `"+escapeMD(line)+"`")
		msg.ParseMode = "markdown"
		if _, err := b.api.Send(msg); err != nil {
			log.Warnf("[bot-telegram] Send log alert failed chat_id=%d error=%q", chatID, err.Error())
		}
	}
}

func escapeMD(s string) string {
	s = strings.ReplaceAll(s, "_", "\\_")
	s = strings.ReplaceAll(s, "*", "\\*")
	s = strings.ReplaceAll(s, "`", "'")
	s = strings.ReplaceAll(s, "[", "\\[")
	return s
}
