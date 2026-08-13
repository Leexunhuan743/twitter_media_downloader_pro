package api

import (
	"fmt"
	"strconv"
	"strings"

	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/scheduler"
	"github.com/unkmonster/tmd/internal/utils"
)

// scheduledDownload 是 scheduler 的业务入口（DownloadFunc）：规范化条目、
// 构造任务并经 createAndEnqueueTask 入队。失败返回真实错误，供调度器
// 写入 ScheduleStatus.LastError，而非折叠为虚假的 "empty task_id"。
func (s *Server) scheduledDownload(entry scheduler.ScheduleEntry) (string, error) {
	taskType, data, err := normalizeScheduledTask(entry)
	if err != nil {
		log.Warnf("[scheduler] Task normalization failed entry_id=%q type=%q name=%q error=%q", entry.ID, entry.Type, entry.Name, err.Error())
		return "", err
	}

	taskID, _, err := s.createAndEnqueueTask(taskType, data, TaskCreateOptions{EntryID: entry.ID})
	if err != nil {
		log.Warnf("[scheduler] Task admission rejected entry_id=%q task_id=%q type=%s error=%q", entry.ID, taskID, taskType, err.Error())
		return "", err
	}
	return taskID, nil
}

// normalizeScheduledTask turns a persisted schedule entry into the same
// TaskType and TaskData used by HTTP and bot producers. It deliberately does
// not construct a service closure; buildTaskRunFunc remains the sole mapper.
func normalizeScheduledTask(entry scheduler.ScheduleEntry) (TaskType, interface{}, error) {
	// 条目校验统一收敛到 scheduler.ValidateEntry（权威实现，含 canonicalize），
	// 此处只做数值/名称提取，不再重复实现校验规则与文案。
	if err := scheduler.ValidateEntry(entry); err != nil {
		return "", nil, err
	}
	flags := DownloadFlags{
		AutoFollow:    entry.AutoFollow,
		FollowMembers: entry.FollowMembers,
		SkipProfile:   entry.SkipProfile,
		NoRetry:       entry.NoRetry,
	}
	switch entry.Type {
	case scheduler.ScheduleTypeList:
		// ValidateEntry 校验的是 canonicalize 副本（list 目标不剥 @），
		// 此处解析调用方原始值：失败或非正整数必须拒绝，避免静默 0 入队。
		listID, err := strconv.ParseUint(strings.TrimSpace(entry.Target), 10, 64)
		if err != nil || listID == 0 {
			return "", nil, fmt.Errorf("invalid list_id %q: must be a positive integer", entry.Target)
		}
		return TaskTypeListDownload, NewListDownloadTask(listID, flags), nil

	case scheduler.ScheduleTypeUser:
		screenName := utils.NormalizeScreenName(strings.TrimSpace(entry.Target))
		return TaskTypeUserDownload, NewUserDownloadTask(screenName, flags), nil

	case scheduler.ScheduleTypeFollowing:
		screenName := utils.NormalizeScreenName(strings.TrimSpace(entry.Target))
		return TaskTypeFollowingDownload, NewFollowingDownloadTask(screenName, flags), nil

	case scheduler.ScheduleTypeMixed:
		lists, err := parseScheduledListIDs(entry.Lists)
		if err != nil {
			return "", nil, fmt.Errorf("invalid lists: %w", err)
		}
		users, err := normalizeBatchScreenNames(entry.Users)
		if err != nil {
			return "", nil, fmt.Errorf("invalid users: %w", err)
		}
		followingNames, err := normalizeBatchScreenNames(entry.FollowingNames)
		if err != nil {
			return "", nil, fmt.Errorf("invalid following_names: %w", err)
		}
		return TaskTypeBatchDownload, NewBatchDownloadTask(users, lists, followingNames, flags), nil

	default:
		// ValidateEntry 已拦截未知类型，此分支仅作防御。
		return "", nil, fmt.Errorf("unknown schedule type %q", entry.Type)
	}
}
