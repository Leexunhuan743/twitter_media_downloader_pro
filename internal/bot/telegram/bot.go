package telegram

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
)

const startupTimeout = 15 * time.Second

// Bot 是 Telegram bot 实现
type Bot struct {
	config      *config.TelegramBotConfig
	taskManager *api.TaskManager
	eventBus    *api.EventBus
	logHub      *consolelog.Hub
	enqueueTask func(*api.Task) error

	api     *tgbotapi.BotAPI
	updates tgbotapi.UpdatesChannel

	tracker *bot.TaskTracker

	stopCh   chan struct{}
	wg       sync.WaitGroup
	stopOnce sync.Once
}

// NewBot 创建 Telegram bot 实例
func NewBot(cfg *config.TelegramBotConfig, tm *api.TaskManager, eb *api.EventBus, lh *consolelog.Hub, enqueueTask func(*api.Task) error) *Bot {
	return &Bot{
		config:      cfg,
		taskManager: tm,
		eventBus:    eb,
		logHub:      lh,
		enqueueTask: enqueueTask,
		tracker:     bot.NewTaskTracker(),
		stopCh:      make(chan struct{}),
	}
}

// Start 启动 bot。非阻塞，启动三个后台 goroutine 处理消息、事件和日志。
func (b *Bot) Start() error {
	client := &http.Client{Timeout: startupTimeout}
	botAPI, err := tgbotapi.NewBotAPIWithClient(b.config.Token, tgbotapi.APIEndpoint, client)
	if err != nil {
		return fmt.Errorf("telegram: failed to create bot: %w", err)
	}
	// NewBotAPI performs GetMe synchronously. Keep that startup request bounded,
	// then remove the global timeout because update polling waits up to 60 seconds.
	client.Timeout = 0
	b.api = botAPI
	log.Infof("[bot-telegram] Started account=%s", b.api.Self.UserName)

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60
	u.AllowedUpdates = []string{"message"}
	b.updates = b.api.GetUpdatesChan(u)

	b.wg.Add(1)
	go b.handleUpdates()
	api.RunBotEventLoop(b.eventBus, b.stopCh, &b.wg, func(evt api.SSEEvent) {
		b.notifyTaskChanges(evt.Data)
	})
	if b.logHub != nil {
		api.RunBotLogLoop(b.logHub, b.stopCh, &b.wg, b.sendLogAlert)
	}
	return nil
}

// Stop 停止 bot，等待所有 goroutine 退出。
func (b *Bot) Stop() {
	b.stopOnce.Do(func() {
		close(b.stopCh)
		b.wg.Wait()
		if b.api != nil {
			b.api.StopReceivingUpdates()
		}
	})
}

// Name 返回 bot 名称
func (b *Bot) Name() string { return "telegram" }

// sendText 发送 Markdown 文本消息到指定 chat
func (b *Bot) sendText(chatID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = "markdown"
	if _, err := b.api.Send(msg); err != nil {
		log.Warnf("[bot-telegram] Send message failed chat_id=%d error=%q", chatID, err.Error())
	}
}
