package discord

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
)

const defaultGatewayStartupTimeout = 15 * time.Second

// Bot 是 Discord bot 实现
type Bot struct {
	config      *config.DiscordBotConfig
	taskManager *api.TaskManager
	eventBus    *api.EventBus
	logHub      *consolelog.Hub
	enqueueTask func(*api.Task) error

	session *discordgo.Session

	channelTasks map[string]map[string]struct{}
	mu           sync.Mutex

	stopCh   chan struct{}
	wg       sync.WaitGroup
	stopOnce sync.Once

	gatewayStartupTimeout time.Duration
}

// NewBot 创建 Discord bot 实例
func NewBot(cfg *config.DiscordBotConfig, tm *api.TaskManager, eb *api.EventBus, lh *consolelog.Hub, enqueueTask func(*api.Task) error) *Bot {
	return &Bot{
		config:                cfg,
		taskManager:           tm,
		eventBus:              eb,
		logHub:                lh,
		enqueueTask:           enqueueTask,
		channelTasks:          make(map[string]map[string]struct{}),
		stopCh:                make(chan struct{}),
		gatewayStartupTimeout: defaultGatewayStartupTimeout,
	}
}

// Start 启动 bot。非阻塞，使用 discordgo Gateway 连接。
func (b *Bot) Start() error {
	session, err := discordgo.New("Bot " + b.config.Token)
	if err != nil {
		return fmt.Errorf("discord: failed to create session: %w", err)
	}
	b.session = session

	session.AddHandler(b.handleInteraction)

	restoreNetworkSettings, interruptOpen := applyGatewayStartupDeadline(session, b.gatewayStartupTimeout)
	err, timedOut := b.openSessionBounded(session, interruptOpen)
	if !timedOut {
		// 超时路径不能恢复连接 deadline：interrupt 设置的过去截止时间
		// 正在唤醒阻塞的读，清除它会让 Open 继续挂住。
		restoreNetworkSettings()
	}
	if err != nil {
		return fmt.Errorf("discord: failed to open gateway: %w", err)
	}
	log.Infof("[bot-discord] Started account=%s", session.State.User.Username)

	// Command registration is part of startup too. Keep it on the same bounded
	// HTTP policy instead of restoring an unbounded client after Gateway open.
	registrationTimeout := b.gatewayStartupTimeout
	if registrationTimeout <= 0 {
		registrationTimeout = defaultGatewayStartupTimeout
	}
	originalClientTimeout := session.Client.Timeout
	session.Client.Timeout = registrationTimeout
	err = b.registerCommands()
	session.Client.Timeout = originalClientTimeout
	if err != nil {
		log.Warnf("[bot-discord] Register commands failed error=%q", err.Error())
	}

	api.RunBotEventLoop(b.eventBus, b.stopCh, &b.wg, func(evt api.SSEEvent) {
		b.notifyTaskChanges(evt.Data)
	})
	if b.logHub != nil {
		api.RunBotLogLoop(b.logHub, b.stopCh, &b.wg, b.sendLogAlert)
	}
	return nil
}

// openSessionBounded runs session.Open with an overall startup deadline.
//
// gorilla/websocket clears the connection deadline right after the 101
// handshake, and discordgo's Hello/READY reads run without any deadline, so a
// gateway that stalls after the handshake would otherwise block Open forever.
// On timeout we interrupt the tracked raw connections (never session.Close,
// which needs the lock Open is holding) so the blocked reads return and the
// Open goroutine exits on its own. The returned bool reports whether the
// timeout fired: the caller must not restore connection deadlines in that
// case, because clearing them would let the still-blocked read continue.
func (b *Bot) openSessionBounded(session *discordgo.Session, interrupt func()) (err error, timedOut bool) {
	timeout := b.gatewayStartupTimeout
	if timeout <= 0 {
		timeout = defaultGatewayStartupTimeout
	}

	type openResult struct {
		err error
	}
	done := make(chan openResult, 1)
	go func() {
		done <- openResult{err: session.Open()}
	}()

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case result := <-done:
		return result.err, false
	case <-timer.C:
		if interrupt != nil {
			interrupt()
		}
		return fmt.Errorf("discord gateway open timed out after %s", timeout), true
	}
}

// Stop 停止 bot，关闭 Gateway 连接。
func (b *Bot) Stop() {
	b.stopOnce.Do(func() {
		close(b.stopCh)
		b.wg.Wait()
		if b.session != nil {
			if err := b.session.Close(); err != nil {
				log.Warnf("[bot-discord] Stop failed error=%q", err.Error())
			}
		}
	})
}

// Name 返回 bot 名称
func (b *Bot) Name() string { return "discord" }

func applyGatewayStartupDeadline(session *discordgo.Session, timeout time.Duration) (restore func(), interrupt func()) {
	if timeout <= 0 {
		timeout = defaultGatewayStartupTimeout
	}
	originalClientTimeout := session.Client.Timeout
	originalHandshakeTimeout := session.Dialer.HandshakeTimeout
	originalDialContext := session.Dialer.NetDialContext
	dialContext := originalDialContext
	if dialContext == nil {
		dialer := &net.Dialer{Timeout: timeout}
		dialContext = dialer.DialContext
	}

	var connectionsMu sync.Mutex
	connections := make([]net.Conn, 0, 1)
	session.Client.Timeout = timeout
	session.Dialer.HandshakeTimeout = timeout
	session.Dialer.NetDialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		conn, err := dialContext(ctx, network, address)
		if err != nil {
			return nil, err
		}
		if err := conn.SetDeadline(time.Now().Add(timeout)); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("set gateway startup deadline: %w", err)
		}
		connectionsMu.Lock()
		connections = append(connections, conn)
		connectionsMu.Unlock()
		return conn, nil
	}

	restore = func() {
		session.Client.Timeout = originalClientTimeout
		session.Dialer.HandshakeTimeout = originalHandshakeTimeout
		session.Dialer.NetDialContext = originalDialContext
		connectionsMu.Lock()
		defer connectionsMu.Unlock()
		for _, conn := range connections {
			_ = conn.SetDeadline(time.Time{})
		}
	}
	interrupt = func() {
		// 使已跟踪的连接立即超时。注意：discordgo 的 Open 全程持有
		// s.Lock()（跨 Hello/READY 无界读），session.Close() 也需要该锁，
		// 在 Open 卡死时调用会死锁——所以这里只打断底层连接，让阻塞的
		// 读返回，Open 随后自行退出并释放锁。
		connectionsMu.Lock()
		defer connectionsMu.Unlock()
		for _, conn := range connections {
			_ = conn.SetDeadline(time.Now())
		}
	}
	return restore, interrupt
}
