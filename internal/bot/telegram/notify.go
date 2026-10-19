package telegram

import (
	"strconv"
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
	var notifications []notification
	for _, task := range tasks {
		if task.Status != api.TaskStatusCompleted && task.Status != api.TaskStatusFailed {
			continue
		}
		for _, scope := range b.tracker.Drain(task.ID) {
			chatID, err := strconv.ParseInt(scope, 10, 64)
			if err != nil {
				continue
			}
			notifications = append(notifications, notification{chatID: chatID, text: api.FormatTaskResult(task, true)})
		}
	}

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
