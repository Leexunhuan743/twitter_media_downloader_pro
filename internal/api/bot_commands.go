package api

import (
	"errors"
	"fmt"
	"strings"

	"github.com/unkmonster/tmd/internal/bot"
)

// NewBotDownloadTask 根据 bot.Request 在任务管理器里创建对应类型的下载任务。
func NewBotDownloadTask(tm *TaskManager, req bot.Request) *Task {
	flags := DownloadFlags{
		AutoFollow:    req.Flags.AutoFollow,
		FollowMembers: req.Flags.FollowMembers,
		SkipProfile:   req.Flags.SkipProfile,
		NoRetry:       req.Flags.NoRetry,
	}
	switch req.Kind {
	case bot.KindList:
		return tm.CreateTask(TaskTypeListDownload, NewListDownloadTask(req.ListID, flags))
	case bot.KindFollowing:
		return tm.CreateTask(TaskTypeFollowingDownload, NewFollowingDownloadTask(req.Target, flags))
	default:
		return tm.CreateTask(TaskTypeUserDownload, NewUserDownloadTask(req.Target, flags))
	}
}

// StartBotDownload 创建任务并提交到下载队列。
// 成功时返回任务与空字符串；失败时返回 nil 或已标记错误的任务，以及要回复给用户的文案。
func StartBotDownload(tm *TaskManager, req bot.Request, enqueue func(*Task) error) (*Task, string) {
	task := NewBotDownloadTask(tm, req)
	if enqueue == nil {
		tm.SetTaskError(task.ID, errors.New("download queue not available"))
		return task, bot.EnqueueFailed
	}
	if err := enqueue(task); err != nil {
		return task, fmt.Sprintf("Failed to enqueue download task: %s", err.Error())
	}
	return task, ""
}

// codeText 在 markdown 模式下把文本包成行内代码，避免任务 ID 里的下划线被解析成斜体。
func codeText(value string, markdown bool) string {
	if !markdown || value == "" {
		return value
	}
	return "\x60" + value + "\x60"
}

// FormatTaskStatus 渲染单个任务的状态文本，供各平台 /status 命令复用。
func FormatTaskStatus(task *Task, markdown bool) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Task: %s\nType: %s\nStatus: %s",
		codeText(task.ID, markdown), codeText(string(task.Type), markdown), codeText(string(task.Status), markdown))
	if task.Progress != nil {
		fmt.Fprintf(&b, "\nProgress: %d/%d (failed: %d)", task.Progress.Completed, task.Progress.Total, task.Progress.Failed)
	}
	if task.Error != "" {
		fmt.Fprintf(&b, "\nError: %s", task.Error)
	}
	return b.String()
}

// FormatTaskList 渲染最近任务列表，limit <= 0 表示不截断。
func FormatTaskList(tasks []*Task, limit int, markdown bool) string {
	if len(tasks) == 0 {
		return bot.NoTasks
	}
	if limit > 0 && len(tasks) > limit {
		tasks = tasks[:limit]
	}
	var b strings.Builder
	b.WriteString("Recent Tasks:")
	for _, task := range tasks {
		fmt.Fprintf(&b, "\n%s | %s | %s", codeText(task.ID, markdown), codeText(string(task.Type), markdown), codeText(string(task.Status), markdown))
		if task.Error != "" {
			fmt.Fprintf(&b, "\n  ❌ %s", task.Error)
		}
	}
	return b.String()
}

// FormatCancelMessage 渲染 /cancel 的回复。
func FormatCancelMessage(result CancelTaskResult, taskID string, markdown bool) string {
	switch result {
	case CancelTaskResultCancelled:
		return fmt.Sprintf("Cancelling %s...", codeText(taskID, markdown))
	case CancelTaskResultNotCancellable:
		return bot.TaskNotCancellable
	default:
		return bot.TaskNotFound
	}
}

// FormatTaskStats 渲染 /stats 的回复。
func FormatTaskStats(stats TaskStatsResponse) string {
	var b strings.Builder
	b.WriteString("Task stats")
	fmt.Fprintf(&b, "\nQueued: %d · Running: %d · Completed: %d", stats.Queued, stats.Running, stats.Completed)
	fmt.Fprintf(&b, "\nFailed: %d · Cancelled: %d · Total: %d", stats.Failed, stats.Cancelled, stats.Total)
	return b.String()
}
