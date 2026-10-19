package feishu

import (
	"context"
	"strings"

	"github.com/chyroc/lark"
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/bot"
)

func (b *Bot) handleMessage(ctx context.Context, event *lark.EventV2IMMessageReceiveV1) {
	if event.Message.MessageType != lark.MsgTypeText {
		return
	}
	content, err := lark.UnwrapMessageContent(event.Message.MessageType, event.Message.Content)
	if err != nil {
		log.Warnf("[bot-feishu] Unwrap message failed message_type=%s error=%q", event.Message.MessageType, err.Error())
		return
	}
	text := strings.TrimSpace(content.Text.Text)
	if text == "" || !strings.HasPrefix(text, "/") {
		return
	}

	// 权限检查
	openID := event.Sender.SenderID.OpenID
	if !b.isAllowed(openID) {
		b.sendReply(event.Message.MessageID, bot.UnauthorizedText)
		return
	}

	// 保存 chat_id 用于主动推送
	b.mu.Lock()
	b.userChats[openID] = event.Message.ChatID
	b.mu.Unlock()

	// 解析命令。用 Fields 切分，tab 与连续空格都能正确处理。
	fields := strings.Fields(text)
	cmd := strings.TrimPrefix(fields[0], "/")
	args := strings.Join(fields[1:], " ")

	switch cmd {
	case "dl", "download":
		b.cmdDownload(event.Message.MessageID, args, openID)
	case "status":
		b.cmdStatus(event.Message.MessageID, args)
	case "cancel":
		b.cmdCancel(event.Message.MessageID, args)
	case "tasks":
		b.cmdTasks(event.Message.MessageID)
	case "stats":
		b.cmdStats(event.Message.MessageID)
	case "start", "help":
		b.cmdHelp(event.Message.MessageID)

	default:
		b.sendReply(event.Message.MessageID, "Unknown command. Send /help for available commands.")
	}
}
