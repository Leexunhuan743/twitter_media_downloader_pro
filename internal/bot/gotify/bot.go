package gotify

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/api"
	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/consolelog"
)

// Bot 是 Gotify 推送 bot 实现（单向通知，无命令交互）
type Bot struct {
	config   *config.GotifyBotConfig
	eventBus *api.EventBus
	logHub   *consolelog.Hub
	client   *http.Client

	notifiedTasks map[string]struct{}
	mu            sync.Mutex
	stopCh        chan struct{}
	wg            sync.WaitGroup
	stopOnce      sync.Once
}

// NewBot 创建 Gotify bot 实例
func NewBot(cfg *config.GotifyBotConfig, eb *api.EventBus, lh *consolelog.Hub) *Bot {
	return &Bot{
		config:        cfg,
		eventBus:      eb,
		logHub:        lh,
		client:        &http.Client{Timeout: 10 * time.Second},
		notifiedTasks: make(map[string]struct{}),
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
	log.Infof("[bot-gotify] Started server=%s", strings.TrimRight(b.config.ServerURL, "/"))
	return nil
}

// Stop 停止 bot。
func (b *Bot) Stop() {
	b.stopOnce.Do(func() {
		close(b.stopCh)
		b.wg.Wait()
	})
}

// Name 返回 bot 名称
func (b *Bot) Name() string { return "gotify" }

func (b *Bot) notifyTaskChanges(data interface{}) {
	tasks, ok := data.([]*api.Task)
	if !ok {
		return
	}
	var pending []*api.Task
	b.mu.Lock()
	if b.notifiedTasks == nil {
		b.notifiedTasks = make(map[string]struct{})
	}
	// 事件里是当前任务的全量快照，快照外的任务已过期或删除：清掉它们的
	// 已通知标记，避免这张 map 随进程运行无限增长。
	live := make(map[string]struct{}, len(tasks))
	for _, task := range tasks {
		live[task.ID] = struct{}{}
	}
	for id := range b.notifiedTasks {
		if _, ok := live[id]; !ok {
			delete(b.notifiedTasks, id)
		}
	}
	for _, task := range tasks {
		if task.Status != api.TaskStatusCompleted && task.Status != api.TaskStatusFailed {
			continue
		}
		if _, ok := b.notifiedTasks[task.ID]; ok {
			continue
		}
		b.notifiedTasks[task.ID] = struct{}{}
		pending = append(pending, task)
	}
	b.mu.Unlock()

	for _, task := range pending {
		title := "❌ TMD Download Failed"
		if task.Status == api.TaskStatusCompleted {
			title = "✅ TMD Download Complete"
		}
		b.sendNotification(title, api.FormatTaskResult(task, true))
	}
}

func (b *Bot) sendLogAlert(line string) {
	b.sendNotification("🔴 TMD Error", line)
}

type gotifyMessage struct {
	Title    string `json:"title"`
	Message  string `json:"message"`
	Priority int    `json:"priority"`
}

func (b *Bot) sendNotification(title, message string) {
	priority := b.config.Priority
	if priority == 0 {
		priority = 5
	}
	body, _ := json.Marshal(gotifyMessage{
		Title:    title,
		Message:  message,
		Priority: priority,
	})

	url := strings.TrimRight(b.config.ServerURL, "/") + "/message"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		log.Warnf("[bot-gotify] Create request failed error=%q", err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Gotify-Key", b.config.Token)

	resp, err := b.client.Do(req)
	if err != nil {
		log.Warnf("[bot-gotify] Send notification failed error=%q", err.Error())
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Warnf("[bot-gotify] Send notification failed status=%d", resp.StatusCode)
	}
}
