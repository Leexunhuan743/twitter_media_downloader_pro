package api

import (
	"fmt"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"
)

func logTaskCreated(task *Task) {
	if task == nil {
		log.Warn("[task] Created task_id=unknown type=unknown target=unknown status=unknown")
		return
	}
	log.Infof("[task] Created task_id=%s type=%s target=%s status=%s", task.ID, task.Type, taskTargetSummary(task), task.Status)
}

func logTaskStarted(task *Task) {
	if task == nil {
		log.Warn("[task] Started task_id=unknown type=unknown target=unknown")
		return
	}
	log.Infof("[task] Started task_id=%s type=%s target=%s", task.ID, task.Type, taskTargetSummary(task))
}

func logTaskCompleted(task *Task) {
	if task == nil {
		log.Warn("[task] Completed type=unknown dur=n/a")
		return
	}
	log.Infof("[task] Completed type=%s dur=%s", task.Type, taskDuration(task))
}

func logTaskFailed(task *Task, err error) {
	message := ""
	if err != nil {
		message = logging.RedactSensitiveText(err.Error())
	} else if task != nil {
		message = logging.RedactSensitiveText(task.Error)
	}
	if task == nil {
		log.Warnf("[task] Failed task_id=unknown type=unknown dur=n/a error=%q", message)
		return
	}
	log.Warnf("[task] Failed task_id=%s type=%s dur=%s error=%q", task.ID, task.Type, taskDuration(task), message)
}

func logTaskCancelled(task *Task) {
	if task == nil {
		log.Warn("[task] Cancelled type=unknown dur=n/a")
		return
	}
	log.Infof("[task] Cancelled type=%s dur=%s", task.Type, taskDuration(task))
}

func taskDuration(task *Task) string {
	if task == nil || task.StartedAt == nil || task.EndedAt == nil {
		return "n/a"
	}
	return task.EndedAt.Sub(*task.StartedAt).String()
}

func taskTargetSummary(task *Task) string {
	if task == nil {
		return "unknown"
	}
	switch data := task.Data.(type) {
	case *UserDownloadTaskData:
		return atTarget(data.ScreenName)
	case *FollowingDownloadTaskData:
		return "following:" + atTarget(data.ScreenName)
	case *ProfileDownloadTaskData:
		return "profile:" + atTarget(data.ScreenName)
	case *MarkDownloadedTaskData:
		return "mark:" + atTarget(data.ScreenName)
	case *FollowingMarkDownloadedTaskData:
		return "mark-following:" + atTarget(data.ScreenName)
	case *ListDownloadTaskData:
		return fmt.Sprintf("list:%d", data.ListID)
	case *ListMarkDownloadedTaskData:
		return fmt.Sprintf("mark-list:%d", data.ListID)
	case *ListProfileTaskData:
		return fmt.Sprintf("list-profile:%d", data.ListID)
	case *JsonFileDownloadTaskData:
		return fmt.Sprintf("json-files:%d", len(data.Paths))
	case *JsonFolderDownloadTaskData:
		return fmt.Sprintf("json-folders:%d", len(data.Paths))
	case *BatchDownloadTaskData:
		return batchTargetSummary(len(data.Users), len(data.Lists), len(data.FollowingNames))
	case *BatchMarkDownloadedTaskData:
		return "mark:" + batchTargetSummary(len(data.Users), len(data.Lists), len(data.FollowingNames))
	case nil:
		return "all"
	default:
		return string(task.Type)
	}
}

func atTarget(screenName string) string {
	screenName = strings.TrimPrefix(strings.TrimSpace(screenName), "@")
	if screenName == "" {
		return "unknown"
	}
	return "@" + screenName
}

func batchTargetSummary(users, lists, following int) string {
	return fmt.Sprintf("batch:users=%d,lists=%d,following=%d", users, lists, following)
}

func logQueueEnqueued(task *Task, depth int) {
	if task == nil {
		log.Warnf("[download-queue] Enqueued type=unknown target=unknown queue_depth=%d", depth)
		return
	}
	log.Infof("[download-queue] Enqueued type=%s target=%s queue_depth=%d", task.Type, taskTargetSummary(task), depth)
}

func logQueueDetached(taskID string, grace time.Duration) {
	log.Warnf("[download-queue] Detached task_id=%s grace=%s", taskID, grace)
}
