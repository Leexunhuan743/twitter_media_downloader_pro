package wechat

import (
	"context"
	"errors"

	"github.com/SpellingDragon/wechat-robot-go/wechat"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
)

func (b *Bot) cmdDownload(ctx context.Context, msg *wechat.Message, args string) {
	if args == "" {
		b.wechatBot.Reply(ctx, msg, bot.UsageDownload)
		return
	}
	req, err := bot.ParseDownloadCommand(args)
	if err != nil {
		if errors.Is(err, bot.ErrInvalidListID) {
			b.wechatBot.Reply(ctx, msg, bot.InvalidListIDText)
			return
		}
		b.wechatBot.Reply(ctx, msg, bot.UsageDownloadShort)
		return
	}
	task, failure := api.StartBotDownload(b.taskManager, req, b.enqueueTask)
	if failure != "" {
		b.wechatBot.Reply(ctx, msg, failure)
		return
	}
	b.tracker.Track(msg.FromUserID, task.ID)
	api.NotifyIfTerminal(b.taskManager, task.ID, func(tasks []*api.Task) { b.notifyTaskChanges(tasks) })
	b.wechatBot.Reply(ctx, msg, bot.DownloadStartedMessage(req.Target, task.ID, false))
}

func (b *Bot) cmdStatus(ctx context.Context, msg *wechat.Message, args string) {
	if args == "" {
		b.wechatBot.Reply(ctx, msg, bot.UsageStatus)
		return
	}
	task, ok := b.taskManager.GetTask(args)
	if !ok {
		b.wechatBot.Reply(ctx, msg, bot.TaskNotFound)
		return
	}
	b.wechatBot.Reply(ctx, msg, api.FormatTaskStatus(task, false))
}

func (b *Bot) cmdCancel(ctx context.Context, msg *wechat.Message, args string) {
	if args == "" {
		b.wechatBot.Reply(ctx, msg, bot.UsageCancel)
		return
	}
	b.wechatBot.Reply(ctx, msg, api.FormatCancelMessage(b.taskManager.CancelTask(args), args, false))
}

func (b *Bot) cmdTasks(ctx context.Context, msg *wechat.Message) {
	b.wechatBot.Reply(ctx, msg, api.FormatTaskList(b.taskManager.GetAllTasks(), 10, false))
}

func (b *Bot) cmdStats(ctx context.Context, msg *wechat.Message) {
	b.wechatBot.Reply(ctx, msg, api.FormatTaskStats(b.taskManager.GetTaskStats()))
}

func (b *Bot) cmdHelp(ctx context.Context, msg *wechat.Message) {
	b.wechatBot.Reply(ctx, msg, bot.HelpText)
}
