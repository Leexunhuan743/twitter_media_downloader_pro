package telegram

import (
	"errors"
	"strconv"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
)

func (b *Bot) cmdStart(msg *tgbotapi.Message) {
	b.sendText(msg.Chat.ID, bot.HelpText)
}

func (b *Bot) cmdDownload(msg *tgbotapi.Message) {
	raw := strings.TrimSpace(msg.CommandArguments())
	if raw == "" {
		b.sendText(msg.Chat.ID, bot.UsageDownload)
		return
	}
	req, err := bot.ParseDownloadCommand(raw)
	if err != nil {
		if errors.Is(err, bot.ErrInvalidListID) {
			b.sendText(msg.Chat.ID, bot.InvalidListIDText)
			return
		}
		b.sendText(msg.Chat.ID, bot.UsageDownloadShort)
		return
	}
	task, failure := api.StartBotDownload(b.taskManager, req, b.enqueueTask)
	if failure != "" {
		b.sendText(msg.Chat.ID, failure)
		return
	}
	b.tracker.Track(strconv.FormatInt(msg.Chat.ID, 10), task.ID)
	api.NotifyIfTerminal(b.taskManager, task.ID, func(tasks []*api.Task) { b.notifyTaskChanges(tasks) })
	b.sendText(msg.Chat.ID, bot.DownloadStartedMessage(req.Target, task.ID, true))
}

func (b *Bot) cmdStatus(msg *tgbotapi.Message) {
	taskID := strings.TrimSpace(msg.CommandArguments())
	if taskID == "" {
		b.sendText(msg.Chat.ID, bot.UsageStatus)
		return
	}
	task, ok := b.taskManager.GetTask(taskID)
	if !ok {
		b.sendText(msg.Chat.ID, bot.TaskNotFound)
		return
	}
	b.sendText(msg.Chat.ID, api.FormatTaskStatus(task, true))
}

func (b *Bot) cmdCancel(msg *tgbotapi.Message) {
	taskID := strings.TrimSpace(msg.CommandArguments())
	if taskID == "" {
		b.sendText(msg.Chat.ID, bot.UsageCancel)
		return
	}
	b.sendText(msg.Chat.ID, api.FormatCancelMessage(b.taskManager.CancelTask(taskID), taskID, true))
}

func (b *Bot) cmdTasks(msg *tgbotapi.Message) {
	b.sendText(msg.Chat.ID, api.FormatTaskList(b.taskManager.GetAllTasks(), 10, true))
}

func (b *Bot) cmdStats(msg *tgbotapi.Message) {
	b.sendText(msg.Chat.ID, api.FormatTaskStats(b.taskManager.GetTaskStats()))
}

func (b *Bot) cmdHelp(msg *tgbotapi.Message) {
	b.cmdStart(msg)
}
