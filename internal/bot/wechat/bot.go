package wechat

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/SpellingDragon/wechat-robot-go/wechat"
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
	"github.com/unkmonster/tmd/internal/logging"
)

// loginQRFileName 是扫码登录二维码落到 app root 下的文件名。
const loginQRFileName = "wechat-qr.png"

// Bot 是微信 iLink bot 实现
type Bot struct {
	config      *config.WeChatBotConfig
	appRootPath string
	taskManager *api.TaskManager
	eventBus    *api.EventBus
	logHub      *consolelog.Hub
	enqueueTask func(*api.Task) error

	wechatBot *wechat.Bot

	userTokens map[string]string
	userTasks  map[string]map[string]struct{}
	mu         sync.Mutex
	stopCh     chan struct{}
	wg         sync.WaitGroup
	cancel     context.CancelFunc
	stopOnce   sync.Once
}

// writeLoginQR 把 SDK 回调收到的登录二维码写到 app root 下。
// 二维码等价于登录凭据：只写盘（0600）并把**路径**交给日志，内容绝不进日志、
// 终端或 Web 面板。SDK 传入的可能是 data URI，也可能是裸 base64。
// 返回写入路径，调用方负责在登录窗口结束后删除。
func writeLoginQR(appRootPath, qrCode string) (string, error) {
	if appRootPath == "" {
		return "", fmt.Errorf("app root path is empty")
	}
	payload := qrCode
	if i := strings.Index(payload, ";base64,"); i >= 0 {
		payload = payload[i+len(";base64,"):]
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(payload))
	if err != nil {
		return "", fmt.Errorf("decode login QR: %w", err)
	}
	if len(data) == 0 {
		return "", fmt.Errorf("login QR payload is empty")
	}

	path := filepath.Join(appRootPath, loginQRFileName)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", fmt.Errorf("write login QR: %w", err)
	}
	return path, nil
}

// NewBot 创建微信 bot 实例
func NewBot(cfg *config.WeChatBotConfig, appRootPath string, tm *api.TaskManager, eb *api.EventBus, lh *consolelog.Hub, enqueueTask func(*api.Task) error) *Bot {
	return &Bot{
		config:      cfg,
		appRootPath: appRootPath,
		taskManager: tm,
		eventBus:    eb,
		logHub:      lh,
		enqueueTask: enqueueTask,
		userTokens:  make(map[string]string),
		userTasks:   make(map[string]map[string]struct{}),
		stopCh:      make(chan struct{}),
	}
}

// Start 启动 bot。扫码登录后订阅消息和事件。
func (b *Bot) Start() error {
	bot := wechat.NewBot(
		wechat.WithTokenFile(b.config.CredentialPath),
	)
	b.wechatBot = bot

	ctx, cancel := context.WithCancel(context.Background())
	b.cancel = cancel

	bot.OnMessage(func(ctx context.Context, msg *wechat.Message) error {
		if !b.isAllowed(msg.FromUserID) {
			return bot.Reply(ctx, msg, "⛔ Unauthorized")
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
		qrPath := ""
		err := b.wechatBot.Login(loginCtx, func(qrCode string) {
			// 二维码是可直接渲染扫描的登录凭据：写盘 0600，日志只给路径。
			// 内容绝不进日志/终端/Web 面板。
			// SDK 在调用 Login 的同一 goroutine 内同步回调（wechat/auth.go#Auth.Login），
			// 因此 qrPath 无需额外同步。
			path, writeErr := writeLoginQR(b.appRootPath, qrCode)
			if writeErr != nil {
				log.Warnf("[bot-wechat] Login QR unavailable bytes=%d error=%q hint=scan_to_login",
					len(qrCode), logging.RedactSensitiveText(writeErr.Error()))
				return
			}
			qrPath = path
			log.Infof("[bot-wechat] Login QR written path=%q bytes=%d hint=scan_to_login", logging.Path(path), len(qrCode))
		})
		loginCancel()
		// 登录窗口结束即删除二维码：它是登录凭据，不应在磁盘上留存。
		if qrPath != "" {
			if removeErr := os.Remove(qrPath); removeErr != nil && !os.IsNotExist(removeErr) {
				log.Warnf("[bot-wechat] Login QR cleanup failed path=%q error=%q", logging.Path(qrPath), removeErr.Error())
			}
		}
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
	parts := strings.SplitN(text, " ", 2)
	cmd := strings.TrimPrefix(parts[0], "/")
	args := ""
	if len(parts) > 1 {
		args = strings.TrimSpace(parts[1])
	}
	switch cmd {
	case "dl", "download":
		b.cmdDownload(ctx, msg, args)
	case "status":
		b.cmdStatus(ctx, msg, args)
	case "cancel":
		b.cmdCancel(ctx, msg, args)
	case "tasks":
		b.cmdTasks(ctx, msg)
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
