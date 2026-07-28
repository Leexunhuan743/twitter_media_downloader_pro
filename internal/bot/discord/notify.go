package discord

import (
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
)

func (b *Bot) notifyTaskChanges(data interface{}) {
	tasks, ok := data.([]*api.Task)
	if !ok {
		return
	}
	type notification struct {
		channelID string
		text      string
	}
	b.mu.Lock()
	var notifications []notification
	for _, task := range tasks {
		if task.Status != api.TaskStatusCompleted && task.Status != api.TaskStatusFailed {
			continue
		}
		for channelID, taskIDs := range b.channelTasks {
			if _, ok := taskIDs[task.ID]; !ok {
				continue
			}
			delete(taskIDs, task.ID)
			if len(taskIDs) == 0 {
				delete(b.channelTasks, channelID)
			}
			notifications = append(notifications, notification{channelID: channelID, text: api.FormatTaskResult(task, true)})
		}
	}
	b.mu.Unlock()

	for _, n := range notifications {
		_, err := b.session.ChannelMessageSend(n.channelID, n.text)
		if err != nil {
			log.Warnf("[bot-discord] Send notification failed channel_id=%s error=%q", n.channelID, err.Error())
		}
	}
}

func (b *Bot) sendLogAlert(line string) {
	for _, userID := range b.config.AllowedUsers {
		channel, err := b.session.UserChannelCreate(userID)
		if err != nil {
			log.Warnf("[bot-discord] Create DM failed user_id=%s error=%q", userID, err.Error())
			continue
		}
		_, err = b.session.ChannelMessageSend(channel.ID, "🔴 `"+escapeDiscord(line)+"`")
		if err != nil {
			log.Warnf("[bot-discord] Send log alert failed channel_id=%s error=%q", channel.ID, err.Error())
		}
	}
}

func escapeDiscord(s string) string {
	result := make([]byte, 0, len(s)*2)
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '_', '*', '`', '~', '|', '>':
			result = append(result, '\\', c)
		default:
			result = append(result, c)
		}
	}
	return string(result)
}
