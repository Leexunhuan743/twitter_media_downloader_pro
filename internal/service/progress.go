package service

import (
	"fmt"
	"strings"

	"github.com/unkmonster/tmd/internal/logging"
)

// Progress 下载进度
type Progress struct {
	Stage     string // "syncing", "downloading", "retrying", "profile", "profile_warning", "marking", "completed"
	Total     int
	Completed int
	Failed    int
	Current   string // 当前处理的用户/列表
}

// MainResult 主下载结果
type MainResult struct {
	Downloaded int
	Failed     int
}

// ProfileResult 资料下载结果
type ProfileResult struct {
	Downloaded int
	Failed     int
	Versioned  int // 版本化（旧文件已备份到 .versions）
}

// Result 执行结果
type Result struct {
	Main    *MainResult
	Profile *ProfileResult
	Message string
}

// ProgressReporter 进度报告接口
//
// OnError 仅用于最终任务状态上报。
// 对于 service 层的 fatal error，应直接返回 error，由外层编排代码统一决定是否调用 OnError/SetTaskError。
type ProgressReporter interface {
	OnProgress(taskID string, p Progress)
	OnComplete(taskID string, r Result)
	OnError(taskID string, err error)
}

// NopReporter 空报告器（用于不需要进度报告的场景）
type NopReporter struct{}

func (n *NopReporter) OnProgress(taskID string, p Progress) {}
func (n *NopReporter) OnComplete(taskID string, r Result)   {}
func (n *NopReporter) OnError(taskID string, err error)     {}

// LogReporter 日志报告器（用于 CLI 模式）
type LogReporter struct {
	logger func(format string, args ...interface{})
}

func NewLogReporter(logger func(format string, args ...interface{})) ProgressReporter {
	return &LogReporter{logger: logger}
}

func (l *LogReporter) OnProgress(taskID string, p Progress) {
	if l.logger == nil {
		return
	}
	// downloading、retrying 和 profile 阶段进度频繁，不输出日志避免刷屏
	if p.Stage == "downloading" || p.Stage == "retrying" || p.Stage == "profile" {
		return
	}
	switch p.Stage {
	case "syncing":
		l.logger("[task] Progress stage=syncing current=%q", p.Current)
	case "marking":
		l.logger("[task] Progress stage=marking current=%q", p.Current)
	case "preparing":
		l.logger("[task] Progress stage=preparing")
	default:
		l.logger("[task] Progress stage=%s current=%q", p.Stage, p.Current)
	}
}

func (l *LogReporter) OnComplete(taskID string, r Result) {
	if l.logger == nil {
		return
	}

	parts := make([]string, 0, 2)
	if r.Main != nil {
		parts = append(parts, formatMainResult(*r.Main))
	}
	if r.Profile != nil {
		parts = append(parts, formatProfileResult(*r.Profile))
	}
	if len(parts) > 0 {
		l.logger("[task] Result summary=%q", strings.Join(parts, ", "))
		return
	}
	l.logger("[task] Result message=%q", r.Message)
}

func (l *LogReporter) OnError(taskID string, err error) {
	if l.logger == nil {
		return
	}
	message := "<nil>"
	if err != nil {
		message = logging.RedactSensitiveText(err.Error())
	}
	l.logger("[task] Failed task_id=%s error=%q", taskID, message)
}

func formatMainResult(r MainResult) string {
	return fmt.Sprintf("main(downloaded=%d, Failedtweet=%d)", r.Downloaded, r.Failed)
}

func formatProfileResult(r ProfileResult) string {
	return fmt.Sprintf("profile(downloaded=%d, failed=%d, versionedfile=%d)", r.Downloaded, r.Failed, r.Versioned)
}
