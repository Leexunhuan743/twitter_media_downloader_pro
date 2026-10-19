package feishu

import (
	"errors"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
)

func (b *Bot) cmdDownload(msgID, raw, openID string) {
	if raw == "" {
		b.sendReply(msgID, bot.UsageDownload)
		return
	}
	req, err := bot.ParseDownloadCommand(raw)
	if err != nil {
		if errors.Is(err, bot.ErrInvalidListID) {
			b.sendReply(msgID, bot.InvalidListIDText)
			return
		}
		b.sendReply(msgID, bot.UsageDownloadShort)
		return
	}
	task, failure := api.StartBotDownload(b.taskManager, req, b.enqueueTask)
	if failure != "" {
		b.sendReply(msgID, failure)
		return
	}
	b.tracker.Track(openID, task.ID)
	b.sendReply(msgID, bot.DownloadStartedMessage(req.Target, task.ID, false))
}

func (b *Bot) cmdStatus(msgID, taskID string) {
	if taskID == "" {
		b.sendReply(msgID, bot.UsageStatus)
		return
	}
	task, ok := b.taskManager.GetTask(taskID)
	if !ok {
		b.sendReply(msgID, bot.TaskNotFound)
		return
	}
	b.sendReply(msgID, api.FormatTaskStatus(task, false))
}

func (b *Bot) cmdCancel(msgID, taskID string) {
	if taskID == "" {
		b.sendReply(msgID, bot.UsageCancel)
		return
	}
	b.sendReply(msgID, api.FormatCancelMessage(b.taskManager.CancelTask(taskID), taskID, false))
}

func (b *Bot) cmdTasks(msgID string) {
	b.sendReply(msgID, api.FormatTaskList(b.taskManager.GetAllTasks(), 10, false))
}

func (b *Bot) cmdStats(msgID string) {
	b.sendReply(msgID, api.FormatTaskStats(b.taskManager.GetTaskStats()))
}

func (b *Bot) cmdHelp(msgID string) {
	b.sendReply(msgID, bot.HelpText)
}
