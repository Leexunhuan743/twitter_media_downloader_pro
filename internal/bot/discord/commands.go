package discord

import (
	"errors"

	"github.com/bwmarrin/discordgo"
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
)

func (b *Bot) cmdDownload(s *discordgo.Session, i *discordgo.InteractionCreate, data discordgo.ApplicationCommandInteractionData) {
	var dlType, target string
	var flags bot.DownloadOptions
	for _, opt := range data.Options {
		switch opt.Name {
		case "type":
			dlType = opt.StringValue()
		case "target":
			target = opt.StringValue()
		case "auto_follow":
			flags.AutoFollow = opt.BoolValue()
		case "follow_members":
			flags.FollowMembers = opt.BoolValue()
		case "skip_profile":
			flags.SkipProfile = opt.BoolValue()
		case "no_retry":
			flags.NoRetry = opt.BoolValue()
		}
	}
	kind, ok := bot.KindFromString(dlType)
	if !ok {
		b.respond(s, i, bot.UsageDownloadShort)
		return
	}
	req, err := bot.NewDownloadRequest(kind, target, flags)
	if err != nil {
		if errors.Is(err, bot.ErrInvalidListID) {
			b.respond(s, i, bot.InvalidListIDText)
			return
		}
		b.respond(s, i, bot.UsageDownloadShort)
		return
	}
	task, failure := api.StartBotDownload(b.taskManager, req, b.enqueueTask)
	if failure != "" {
		b.respond(s, i, failure)
		return
	}
	b.tracker.Track(i.ChannelID, task.ID)
	api.NotifyIfTerminal(b.taskManager, task.ID, func(tasks []*api.Task) { b.notifyTaskChanges(tasks) })
	b.respond(s, i, bot.DownloadStartedMessage(req.Target, task.ID, true))
}

func (b *Bot) cmdStatus(s *discordgo.Session, i *discordgo.InteractionCreate, data discordgo.ApplicationCommandInteractionData) {
	if len(data.Options) == 0 {
		b.respond(s, i, bot.UsageStatus)
		return
	}
	taskID := data.Options[0].StringValue()
	task, ok := b.taskManager.GetTask(taskID)
	if !ok {
		b.respond(s, i, bot.TaskNotFound)
		return
	}
	b.respond(s, i, api.FormatTaskStatus(task, true))
}

func (b *Bot) cmdCancel(s *discordgo.Session, i *discordgo.InteractionCreate, data discordgo.ApplicationCommandInteractionData) {
	if len(data.Options) == 0 {
		b.respond(s, i, bot.UsageCancel)
		return
	}
	taskID := data.Options[0].StringValue()
	b.respond(s, i, api.FormatCancelMessage(b.taskManager.CancelTask(taskID), taskID, true))
}

func (b *Bot) cmdTasks(s *discordgo.Session, i *discordgo.InteractionCreate) {
	b.respond(s, i, api.FormatTaskList(b.taskManager.GetAllTasks(), 10, true))
}

func (b *Bot) cmdStats(s *discordgo.Session, i *discordgo.InteractionCreate) {
	b.respond(s, i, api.FormatTaskStats(b.taskManager.GetTaskStats()))
}

func (b *Bot) cmdHelp(s *discordgo.Session, i *discordgo.InteractionCreate) {
	b.respond(s, i, bot.HelpText)
}

func (b *Bot) respond(s *discordgo.Session, i *discordgo.InteractionCreate, content string) {
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: content,
		},
	}); err != nil {
		log.Warnf("[bot-discord] Respond failed error=%q", err.Error())
	}
}
