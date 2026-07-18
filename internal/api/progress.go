package api

import (
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/service"
)

// SSEProgressReporter SSE 进度报告器
// 同时将进度反馈输出到日志（复用 service.LogReporter，与 CLI 模式格式一致），
// 并通过 TaskManager 推送给前端 UI（SSE）。
type SSEProgressReporter struct {
	server *Server
	log    service.ProgressReporter // 日志报告器，复用 LogReporter 格式
}

// NewSSEProgressReporter 创建 SSE 进度报告器
func NewSSEProgressReporter(server *Server) service.ProgressReporter {
	return &SSEProgressReporter{
		server: server,
		log:    service.NewLogReporter(log.Infof),
	}
}

func (r *SSEProgressReporter) OnProgress(taskID string, p service.Progress) {
	// 日志输出（与 CLI 模式格式一致）
	r.log.OnProgress(taskID, p)
	// 更新 TaskManager 中的进度（包含完整信息）
	r.server.taskManager.UpdateTaskProgress(taskID, &TaskProgress{
		Stage:     p.Stage,
		Total:     p.Total,
		Completed: p.Completed,
		Failed:    p.Failed,
		Current:   p.Current,
	})
}

func (r *SSEProgressReporter) OnComplete(taskID string, result service.Result) {
	// 日志输出
	r.log.OnComplete(taskID, result)
	// 自动更新任务结果和状态，避免竞态条件
	taskResult := &TaskResult{Message: result.Message}
	if result.Main != nil {
		taskResult.Main = &TaskMainResult{
			Downloaded: result.Main.Downloaded,
			Failed:     result.Main.Failed,
		}
	}
	if result.Profile != nil {
		taskResult.Profile = &TaskProfileResult{
			Downloaded: result.Profile.Downloaded,
			Failed:     result.Profile.Failed,
			Versioned:  result.Profile.Versioned,
		}
	}
	r.server.taskManager.CompleteTask(taskID, taskResult)
}

func (r *SSEProgressReporter) OnError(taskID string, err error) {
	// 日志输出
	r.log.OnError(taskID, err)
	// 设置任务错误
	r.server.taskManager.SetTaskError(taskID, err)
}
