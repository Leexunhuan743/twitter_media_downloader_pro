package api

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/scheduler"
	"github.com/unkmonster/tmd/internal/utils"
)

func (s *Server) scheduledDownload(entry scheduler.ScheduleEntry) string {
	taskType, data, err := normalizeScheduledTask(entry)
	if err != nil {
		log.Warnf("[scheduler] Task normalization failed entry_id=%q type=%q name=%q error=%q", entry.ID, entry.Type, entry.Name, err.Error())
		return ""
	}

	taskID, _, err := s.createAndEnqueueTask(taskType, data, TaskCreateOptions{EntryID: entry.ID})
	if err != nil {
		log.Warnf("[scheduler] Task admission rejected entry_id=%q task_id=%q type=%s error=%q", entry.ID, taskID, taskType, err.Error())
		return ""
	}
	return taskID
}

// normalizeScheduledTask turns a persisted schedule entry into the same
// TaskType and TaskData used by HTTP and bot producers. It deliberately does
// not construct a service closure; buildTaskRunFunc remains the sole mapper.
func normalizeScheduledTask(entry scheduler.ScheduleEntry) (TaskType, interface{}, error) {
	switch entry.Type {
	case scheduler.ScheduleTypeList:
		listID, err := strconv.ParseUint(strings.TrimSpace(entry.Target), 10, 64)
		if err != nil || listID == 0 {
			return "", nil, fmt.Errorf("invalid list_id %q: must be a positive integer", entry.Target)
		}
		return TaskTypeListDownload, &ListDownloadTaskData{
			ListID:        StringUint64(listID),
			AutoFollow:    entry.AutoFollow,
			FollowMembers: entry.FollowMembers,
			SkipProfile:   entry.SkipProfile,
			NoRetry:       entry.NoRetry,
		}, nil

	case scheduler.ScheduleTypeUser:
		screenName := utils.NormalizeScreenName(strings.TrimSpace(entry.Target))
		if !utils.IsValidScreenName(screenName) {
			return "", nil, fmt.Errorf("invalid screen_name %q", entry.Target)
		}
		return TaskTypeUserDownload, &UserDownloadTaskData{
			ScreenName:    screenName,
			AutoFollow:    entry.AutoFollow,
			FollowMembers: entry.FollowMembers,
			SkipProfile:   entry.SkipProfile,
			NoRetry:       entry.NoRetry,
		}, nil

	case scheduler.ScheduleTypeFollowing:
		screenName := utils.NormalizeScreenName(strings.TrimSpace(entry.Target))
		if !utils.IsValidScreenName(screenName) {
			return "", nil, fmt.Errorf("invalid screen_name %q", entry.Target)
		}
		return TaskTypeFollowingDownload, &FollowingDownloadTaskData{
			ScreenName:    screenName,
			AutoFollow:    entry.AutoFollow,
			FollowMembers: entry.FollowMembers,
			SkipProfile:   entry.SkipProfile,
			NoRetry:       entry.NoRetry,
		}, nil

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
		if len(users) == 0 && len(lists) == 0 && len(followingNames) == 0 {
			return "", nil, errors.New("mixed schedule has no targets")
		}
		return TaskTypeBatchDownload, &BatchDownloadTaskData{
			Users:          users,
			Lists:          lists,
			FollowingNames: followingNames,
			AutoFollow:     entry.AutoFollow,
			FollowMembers:  entry.FollowMembers,
			SkipProfile:    entry.SkipProfile,
			NoRetry:        entry.NoRetry,
		}, nil

	default:
		return "", nil, fmt.Errorf("unknown schedule type %q", entry.Type)
	}
}
