// 调度器触发的下载任务创建(与 HTTP 下载 handler 分离)。
package api

import (
	"context"
	"strconv"
	"strings"

	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/scheduler"
	"github.com/unkmonster/tmd/internal/service"
	"github.com/unkmonster/tmd/internal/utils"
)

func (s *Server) scheduledDownload(entry scheduler.ScheduleEntry) string {
	opts := service.DownloadOptions{
		AutoFollow:    entry.AutoFollow,
		FollowMembers: entry.FollowMembers,
		SkipProfile:   entry.SkipProfile,
		NoRetry:       entry.NoRetry,
	}

	switch entry.Type {
	case scheduler.ScheduleTypeList:
		listID, err := strconv.ParseUint(entry.Target, 10, 64)
		if err != nil {
			log.Warnf("[scheduler] Invalid target entry_id=%q type=%s field=list_id value=%q error=%q", entry.ID, entry.Type, entry.Target, err.Error())
			return ""
		}
		if listID == 0 {
			log.Warnf("[scheduler] Invalid target entry_id=%q type=%s field=list_id value=%q reason=not_positive", entry.ID, entry.Type, entry.Target)
			return ""
		}
		req := &ListDownloadTaskData{
			ListID:        StringUint64(listID),
			AutoFollow:    entry.AutoFollow,
			FollowMembers: entry.FollowMembers,
			SkipProfile:   entry.SkipProfile,
			NoRetry:       entry.NoRetry,
		}
		task := s.taskManager.CreateTask(TaskTypeListDownload, req)
		task.EntryID = entry.ID
		s.enqueueTask(task, func(ctx context.Context, taskID string, reporter service.ProgressReporter) error {
			return s.downloadService.ListDownload(ctx, taskID, listID, opts, reporter)
		})
		return task.ID

	case scheduler.ScheduleTypeUser:
		screenName := utils.NormalizeScreenName(strings.TrimSpace(entry.Target))
		if !utils.IsValidScreenName(screenName) {
			log.Warnf("[scheduler] Invalid target entry_id=%q type=%s field=screen_name value=%q", entry.ID, entry.Type, entry.Target)
			return ""
		}
		req := &UserDownloadTaskData{
			ScreenName:    screenName,
			AutoFollow:    entry.AutoFollow,
			FollowMembers: entry.FollowMembers,
			SkipProfile:   entry.SkipProfile,
			NoRetry:       entry.NoRetry,
		}
		task := s.taskManager.CreateTask(TaskTypeUserDownload, req)
		task.EntryID = entry.ID
		s.enqueueTask(task, func(ctx context.Context, taskID string, reporter service.ProgressReporter) error {
			return s.downloadService.UserDownload(ctx, taskID, screenName, opts, reporter)
		})
		return task.ID

	case scheduler.ScheduleTypeFollowing:
		screenName := utils.NormalizeScreenName(strings.TrimSpace(entry.Target))
		if !utils.IsValidScreenName(screenName) {
			log.Warnf("[scheduler] Invalid target entry_id=%q type=%s field=screen_name value=%q", entry.ID, entry.Type, entry.Target)
			return ""
		}
		req := &FollowingDownloadTaskData{
			ScreenName:    screenName,
			AutoFollow:    entry.AutoFollow,
			FollowMembers: entry.FollowMembers,
			SkipProfile:   entry.SkipProfile,
			NoRetry:       entry.NoRetry,
		}
		task := s.taskManager.CreateTask(TaskTypeFollowingDownload, req)
		task.EntryID = entry.ID
		s.enqueueTask(task, func(ctx context.Context, taskID string, reporter service.ProgressReporter) error {
			return s.downloadService.FollowingDownload(ctx, taskID, screenName, opts, reporter)
		})
		return task.ID

	case scheduler.ScheduleTypeMixed:
		lists, err := parseScheduledListIDs(entry.Lists)
		if err != nil {
			log.Warnf("[scheduler] Invalid mixed schedule entry_id=%q name=%q field=lists error=%q", entry.ID, entry.Name, err.Error())
			return ""
		}
		users, err := normalizeBatchScreenNames(entry.Users)
		if err != nil {
			log.Warnf("[scheduler] Invalid mixed schedule entry_id=%q name=%q field=users error=%q", entry.ID, entry.Name, err.Error())
			return ""
		}
		followingNames, err := normalizeBatchScreenNames(entry.FollowingNames)
		if err != nil {
			log.Warnf("[scheduler] Invalid mixed schedule entry_id=%q name=%q field=following error=%q", entry.ID, entry.Name, err.Error())
			return ""
		}
		listIDs, err := validateBatchListIDs(lists)
		if err != nil {
			log.Warnf("[scheduler] Invalid mixed schedule entry_id=%q name=%q field=list_ids error=%q", entry.ID, entry.Name, err.Error())
			return ""
		}
		if len(users) == 0 && len(lists) == 0 && len(followingNames) == 0 {
			log.Warnf("[scheduler] Invalid mixed schedule entry_id=%q name=%q reason=no_targets", entry.ID, entry.Name)
			return ""
		}

		req := &BatchDownloadTaskData{
			Users:          users,
			Lists:          lists,
			FollowingNames: followingNames,
			AutoFollow:     entry.AutoFollow,
			FollowMembers:  entry.FollowMembers,
			SkipProfile:    entry.SkipProfile,
			NoRetry:        entry.NoRetry,
		}
		task := s.taskManager.CreateTask(TaskTypeBatchDownload, req)
		task.EntryID = entry.ID
		s.enqueueTask(task, func(ctx context.Context, taskID string, reporter service.ProgressReporter) error {
			return s.downloadService.BatchDownload(ctx, taskID, req.Users, listIDs, req.FollowingNames, opts, reporter)
		})
		return task.ID

	default:
		log.Warnf("[scheduler] Unknown schedule type entry_id=%q type=%q", entry.ID, entry.Type)
	}

	return ""
}
