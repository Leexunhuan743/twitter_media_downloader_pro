package wechat

import (
	"context"
	"github.com/SpellingDragon/wechat-robot-go/wechat"
	log "github.com/sirupsen/logrus"
	"strings"
	"sync"
	"time"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/bot"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
	"github.com/unkmonster/tmd/internal/logging"
)

// Bot 是微信 iLink bot 实现
type Bot struct {
	config      *config.WeChatBotConfig
	taskManager *api.TaskManager
	eventBus    *api.EventBus
	logHub      *consolelog.Hub
	enqueueTask func(*api.Task) error

	wechatBot *wechat.Bot

	userTokens map[string]string
	tracker    *bot.TaskTracker
	mu         sync.Mutex
	stopCh     chan struct{}
	wg         sync.WaitGroup
	cancel     context.CancelFunc
	stopOnce   sync.Once
}

// NewBot 创建微信 bot 实例
func NewBot(cfg *config.WeChatBotConfig, tm *api.TaskManager, eb *api.EventBus, lh *consolelog.Hub, enqueueTask func(*api.Task) error) *Bot {
	return &Bot{
		config:      cfg,
		taskManager: tm,
		eventBus:    eb,
		logHub:      lh,
		enqueueTask: enqueueTask,
		userTokens:  make(map[string]string),
		tracker:     bot.NewTaskTracker(),
		stopCh:      make(chan struct{}),
	}
}

// Start 启动 bot。扫码登录后订阅消息和事件。
func (b *Bot) Start() error {
	wb := wechat.NewBot(
		wechat.WithTokenFile(b.config.CredentialPath),
	)
	b.wechatBot = wb

	ctx, cancel := context.WithCancel(context.Background())
	b.cancel = cancel

	wb.OnMessage(func(ctx context.Context, msg *wechat.Message) error {
		if !b.isAllowed(msg.FromUserID) {
			return wb.Reply(ctx, msg, bot.UnauthorizedText)
		}
		b.mu.Lock()
		b.userTokens[msg.FromUserID] = msg.ContextToken
		b.mu.Unlock()
		b.handleMessage(ctx, msg)
		return nil
	})

	api.RunBotEventLoop(b.eventBus, b.stopCh, &b.wg, func(evt api.SSEEvent) {
		b.notifyTaskChanges(evt.Data)
	})
	if b.logHub != nil {
		api.RunBotLogLoop(b.logHub, b.stopCh, &b.wg, b.sendLogAlert)
	}

	b.wg.Add(1)
	go func() {
		defer b.wg.Done()
		b.runWithReconnect(ctx)
	}()

	log.Infof("[bot-wechat] Starting credential_path=%q", logging.Path(b.config.CredentialPath))
	return nil
}

func (b *Bot) runWithReconnect(ctx context.Context) {
	for {
		select {
		case <-b.stopCh:
			return
		default:
		}

		loginCtx, loginCancel := context.WithTimeout(ctx, 2*time.Minute)
		err := b.wechatBot.Login(loginCtx, func(qrCode string) {
			// 二维码是可直接渲染扫描的 base64 图像（登录凭据），绝不能进日志
			// （终端/文件/Web 面板）。只记录接收到的数据大小，便于排查。
			log.Infof("[bot-wechat] Login QR received bytes=%d hint=scan_to_login", len(qrCode))
		})
		loginCancel()
		if err != nil {
			log.Warnf("[bot-wechat] Login failed retry_after=30s error=%q", err.Error())
			select {
			case <-b.stopCh:
				return
			case <-time.After(30 * time.Second):
			}
			continue
		}
		log.Info("[bot-wechat] Logged in")

		b.wechatBot.Run(ctx)

		select {
		case <-b.stopCh:
			return
		case <-time.After(5 * time.Second):
			log.Warn("[bot-wechat] Connection lost reconnecting=true")
		}
	}
}

// Stop 停止 bot
func (b *Bot) Stop() {
	b.stopOnce.Do(func() {
		if b.cancel != nil {
			b.cancel()
		}
		close(b.stopCh)
		b.wg.Wait()
	})
}

// Name 返回 bot 名称
func (b *Bot) Name() string { return "wechat" }

func (b *Bot) isAllowed(userID string) bool {
	if len(b.config.AllowedUsers) == 0 {
		return true
	}
	for _, id := range b.config.AllowedUsers {
		if id == userID {
			return true
		}
	}
	return false
}

func (b *Bot) handleMessage(ctx context.Context, msg *wechat.Message) {
	text := strings.TrimSpace(msg.Text())
	if text == "" || !strings.HasPrefix(text, "/") {
		return
	}
	fields := strings.Fields(text)
	cmd := strings.TrimPrefix(fields[0], "/")
	args := strings.Join(fields[1:], " ")
	switch cmd {
	case "dl", "download":
		b.cmdDownload(ctx, msg, args)
	case "status":
		b.cmdStatus(ctx, msg, args)
	case "cancel":
		b.cmdCancel(ctx, msg, args)
	case "tasks":
		b.cmdTasks(ctx, msg)
	case "stats":
		b.cmdStats(ctx, msg)
	case "start", "help":
		b.cmdHelp(ctx, msg)
	default:
		b.wechatBot.Reply(ctx, msg, "Unknown command. Send /help for available commands.")
	}
}

func (b *Bot) sendText(ctx context.Context, userID, text string) {
	if err := b.wechatBot.SendTextToUser(ctx, userID, text); err != nil {
		log.Warnf("[bot-wechat] Send message failed user_id=%s error=%q", userID, err.Error())
	}
}
