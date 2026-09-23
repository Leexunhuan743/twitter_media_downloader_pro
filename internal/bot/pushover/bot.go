package pushover

import (
	"net/http"
	"net/url"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
)

// Bot 是 Pushover 推送 bot 实现（单向通知，无命令交互）
type Bot struct {
	config   *config.PushoverBotConfig
	eventBus *api.EventBus
	logHub   *consolelog.Hub
	client   *http.Client

	notifiedTasks map[string]struct{}
	// seenTaskIDs 是 notifyTaskChanges 的复用缓冲：记录本轮 tasks 快照中仍存在的任务 ID。
	// 复用而非每个事件新建，避免高频任务事件带来的重复分配；仅在持有 mu 时读写。
	seenTaskIDs map[string]struct{}
	mu          sync.Mutex
	stopCh      chan struct{}
	wg          sync.WaitGroup
	stopOnce    sync.Once
}

// NewBot 创建 Pushover bot 实例
func NewBot(cfg *config.PushoverBotConfig, eb *api.EventBus, lh *consolelog.Hub) *Bot {
	return &Bot{
		config:        cfg,
		eventBus:      eb,
		logHub:        lh,
		client:        &http.Client{Timeout: 10 * time.Second},
		notifiedTasks: make(map[string]struct{}),
		seenTaskIDs:   make(map[string]struct{}),
		stopCh:        make(chan struct{}),
	}
}

func (b *Bot) Start() error {
	api.RunBotEventLoop(b.eventBus, b.stopCh, &b.wg, func(evt api.SSEEvent) {
		b.notifyTaskChanges(evt.Data)
	})
	if b.logHub != nil {
		api.RunBotLogLoop(b.logHub, b.stopCh, &b.wg, b.sendLogAlert)
	}
	log.Infof("[bot-pushover] Started device=%q sound=%q", b.config.Device, b.config.Sound)
	return nil
}

// Stop 停止 bot
func (b *Bot) Stop() {
	b.stopOnce.Do(func() {
		close(b.stopCh)
		b.wg.Wait()
	})
}

// Name 返回 bot 名称
func (b *Bot) Name() string { return "pushover" }

func (b *Bot) notifyTaskChanges(data interface{}) {
	tasks, ok := data.([]*api.Task)
	if !ok {
		return
	}
	var pending []*api.Task
	b.mu.Lock()
	// tasks 事件始终是完整快照（唯一生产者 TaskManager.publishTasks），可据此淘汰已离场任务的
	// 记录：任务被手动删除或被 24h 清理后不再出现在快照里，对应键在本轮删除。
	// 于是 notifiedTasks 恒为「当前快照内已通知的终态任务」子集，其上界为任务管理器中的任务数
	// （自身受 24h 清理约束），不会随服务运行时长单调增长。
	// 该裁剪依赖上面的完整快照前提：若将来出现只发部分任务的 tasks 事件，缺席的任务会被误删并重复通知。
	clear(b.seenTaskIDs)
	for _, task := range tasks {
		b.seenTaskIDs[task.ID] = struct{}{}
		if task.Status != api.TaskStatusCompleted && task.Status != api.TaskStatusFailed {
			continue
		}
		if _, ok := b.notifiedTasks[task.ID]; ok {
			continue
		}
		b.notifiedTasks[task.ID] = struct{}{}
		pending = append(pending, task)
	}
	for id := range b.notifiedTasks {
		if _, ok := b.seenTaskIDs[id]; !ok {
			delete(b.notifiedTasks, id)
		}
	}
	b.mu.Unlock()

	for _, task := range pending {
		title := "❌ TMD Download Failed"
		if task.Status == api.TaskStatusCompleted {
			title = "✅ TMD Download Complete"
		}
		b.sendNotification(title, api.FormatTaskResult(task, false))
	}
}

func (b *Bot) sendLogAlert(line string) {
	b.sendNotification("🔴 TMD Error", line)
}

func (b *Bot) sendNotification(title, message string) {
	vals := url.Values{
		"token":   {b.config.Token},
		"user":    {b.config.User},
		"title":   {title},
		"message": {message},
	}
	if b.config.Device != "" {
		vals.Set("device", b.config.Device)
	}
	if b.config.Sound != "" {
		vals.Set("sound", b.config.Sound)
	}

	resp, err := b.client.PostForm("https://api.pushover.net/1/messages.json", vals)
	if err != nil {
		log.Warnf("[bot-pushover] Send notification failed error=%q", err.Error())
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Warnf("[bot-pushover] Send notification failed status=%d", resp.StatusCode)
	}
}
