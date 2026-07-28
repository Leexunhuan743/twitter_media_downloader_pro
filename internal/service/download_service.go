package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
	log "github.com/sirupsen/logrus"

	"github.com/unkmonster/tmd/internal/config"
	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/downloader"
	"github.com/unkmonster/tmd/internal/downloading"
	"github.com/unkmonster/tmd/internal/downloading/profile"
	"github.com/unkmonster/tmd/internal/logging"
	"github.com/unkmonster/tmd/internal/path"
	"github.com/unkmonster/tmd/internal/twitter"
	"github.com/unkmonster/tmd/internal/utils"
)

type downloadServiceImpl struct {
	deps     *Dependencies
	dumperMu sync.Mutex
}

func (s *downloadServiceImpl) maxDownloadRoutine() int {
	if s.deps != nil && s.deps.Config != nil && s.deps.Config.MaxDownloadRoutine > 0 {
		return s.deps.Config.MaxDownloadRoutine
	}
	return config.DefaultMaxDownloadRoutine()
}

func (s *downloadServiceImpl) maxFileNameLen() int {
	if s.deps != nil && s.deps.Config != nil && s.deps.Config.MaxFileNameLen > 0 {
		return s.deps.Config.MaxFileNameLen
	}
	return utils.DefaultMaxFileNameLen
}

func (s *downloadServiceImpl) runtimeOptions() downloading.RuntimeOptions {
	return downloading.RuntimeOptions{
		MaxDownloadRoutine: s.maxDownloadRoutine(),
		MaxFileNameLen:     s.maxFileNameLen(),
	}
}

func (s *downloadServiceImpl) profileDownloaderConfig() *profile.Config {
	cfg := profile.DefaultConfig()
	cfg.MaxDownloadRoutine = s.maxDownloadRoutine()
	cfg.MaxFileNameLen = s.maxFileNameLen()
	return cfg
}

func (s *downloadServiceImpl) getReporterOrDefault(reporter ProgressReporter) ProgressReporter {
	if reporter == nil {
		return &NopReporter{}
	}
	return reporter
}

func (s *downloadServiceImpl) completeTask(taskID string, reporter ProgressReporter, message string, stats *Result, warning string) {
	result := Result{Message: message}
	if warning != "" {
		result.Message = fmt.Sprintf("%s (%s)", message, warning)
	}
	if stats != nil {
		if stats.Main != nil {
			main := *stats.Main
			result.Main = &main
		}
		if stats.Profile != nil {
			profile := *stats.Profile
			result.Profile = &profile
		}
	}
	reporter.OnComplete(taskID, result)
}

func (s *downloadServiceImpl) completeProfileTask(taskID string, reporter ProgressReporter, profileResult *ProfileResult) {
	if profileResult == nil {
		reporter.OnComplete(taskID, Result{Message: "No profile downloads performed"})
		return
	}
	profile := *profileResult
	reporter.OnComplete(taskID, Result{
		Profile: &profile,
		Message: formatProfileCompletionMessage(profile),
	})
}

func downloadOptionsSummary(opts DownloadOptions) string {
	return fmt.Sprintf("auto_follow=%t follow_members=%t skip_profile=%t no_retry=%t",
		opts.AutoFollow, opts.FollowMembers, opts.SkipProfile, opts.NoRetry)
}

func safeDownloadError(err error) string {
	if err == nil {
		return ""
	}
	return logging.RedactSensitiveText(err.Error())
}

func (s *downloadServiceImpl) newBatchProgressCallback(taskID string, reporter ProgressReporter) downloading.BatchProgressFunc {
	return func(progress downloading.BatchProgress) {
		reporter.OnProgress(taskID, Progress{
			Stage:     "downloading",
			Total:     progress.Total,
			Completed: progress.Completed,
			Failed:    progress.Failed,
			Current:   progress.Current,
		})
	}
}

func (s *downloadServiceImpl) newRetryProgressCallback(taskID string, reporter ProgressReporter) downloading.RetryProgressFunc {
	return func(progress downloading.RetryProgress) {
		reporter.OnProgress(taskID, Progress{
			Stage:     "retrying",
			Total:     progress.Total,
			Completed: progress.Completed,
			Failed:    progress.Failed,
		})
	}
}

func (s *downloadServiceImpl) buildMainDownloadResult(summary downloading.BatchDownloadSummary, failed int) *MainResult {
	if summary.TotalEntities == 0 {
		return nil
	}
	return &MainResult{
		Downloaded: max(0, summary.TotalEntities-failed),
		Failed:     failed,
	}
}

type failedTweetSet map[int]map[uint64]struct{}

func collectFailedTweetSet(failedTweets []*downloading.TweetInEntity) failedTweetSet {
	failures := make(failedTweetSet)
	for _, failedTweet := range failedTweets {
		if failedTweet == nil || failedTweet.Tweet == nil || failedTweet.Entity == nil {
			continue
		}
		entityID, err := failedTweet.Entity.Id()
		if err != nil {
			continue
		}
		if failures[entityID] == nil {
			failures[entityID] = make(map[uint64]struct{})
		}
		failures[entityID][failedTweet.Tweet.Id] = struct{}{}
	}
	return failures
}

func countRemainingFailedEntities(dumper *downloading.TweetDumper, failures failedTweetSet) int {
	if dumper == nil || len(failures) == 0 {
		return 0
	}
	count := 0
	for entityID, tweetIDs := range failures {
		for tweetID := range tweetIDs {
			if dumper.HasTweet(entityID, tweetID) {
				count++
				break
			}
		}
	}
	return count
}

// resolveFailure 记录单个 screenName/listID 解析失败的原因
type resolveFailure struct {
	Identifier string // screenName 或 listID 字符串
	Kind       string // "user" / "list" / "following"
	Err        error
}

func (s *downloadServiceImpl) resolveUsers(ctx context.Context, screenNames []string) ([]*twitter.User, []resolveFailure) {
	var users []*twitter.User
	var failures []resolveFailure
	for _, name := range screenNames {
		user, uid, err := twitter.GetUserByScreenName(ctx, s.deps.Client, s.deps.AdditionalClients, name)
		if err != nil {
			database.MarkUserInaccessible(s.deps.DB, uid, name)
			failures = append(failures, resolveFailure{Identifier: name, Kind: "user", Err: err})
			log.Warnf("[download] Resolve failed kind=user identifier=%q error=%q", name, safeDownloadError(err))
			continue
		}
		users = append(users, user)
	}
	return users, failures
}

func (s *downloadServiceImpl) resolveLists(ctx context.Context, listIDs []uint64) ([]twitter.ListBase, []resolveFailure) {
	var lists []twitter.ListBase
	var failures []resolveFailure
	for _, id := range listIDs {
		// 列表是用户私有资源，只能使用主账号访问，不走 MFQ 多账号轮询
		list, err := twitter.GetLst(ctx, s.deps.Client, id)
		if err != nil {
			failures = append(failures, resolveFailure{Identifier: fmt.Sprintf("%d", id), Kind: "list", Err: err})
			log.Warnf("[download] Resolve failed kind=list identifier=%d error=%q", id, safeDownloadError(err))
			continue
		}
		lists = append(lists, list)
	}
	return lists, failures
}

func (s *downloadServiceImpl) resolveFollowings(ctx context.Context, screenNames []string) ([]twitter.ListBase, []resolveFailure) {
	var lists []twitter.ListBase
	var failures []resolveFailure
	for _, name := range screenNames {
		user, uid, err := twitter.GetUserByScreenName(ctx, s.deps.Client, s.deps.AdditionalClients, name)
		if err != nil {
			database.MarkUserInaccessible(s.deps.DB, uid, name)
			failures = append(failures, resolveFailure{Identifier: name, Kind: "following", Err: err})
			log.Warnf("[download] Resolve failed kind=following identifier=%q error=%q", name, safeDownloadError(err))
			continue
		}
		lists = append(lists, user.Following())
	}
	return lists, failures
}

func shouldFollowMember(user *twitter.User) bool {
	if user == nil || user.Id == 0 {
		return false
	}
	if user.Blocking || user.Muting {
		return false
	}
	return user.Followstate == twitter.FS_UNFOLLOW
}

func (s *downloadServiceImpl) followMembersIfNeeded(ctx context.Context, users []*twitter.User) error {
	if len(users) == 0 {
		return nil
	}

	seen := make(map[uint64]struct{}, len(users))
	for _, user := range users {
		if !shouldFollowMember(user) {
			continue
		}
		if _, ok := seen[user.Id]; ok {
			continue
		}
		seen[user.Id] = struct{}{}

		if err := ctx.Err(); err != nil {
			return err
		}
		if err := twitter.FollowUser(ctx, s.deps.Client, user); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err
			}
			log.Warnf("[download] Follow member failed user=@%s uid=%d error=%q", user.ScreenName, user.Id, safeDownloadError(err))
			continue
		}
	}
	return nil
}

func effectiveAutoFollow(opts DownloadOptions) bool {
	return opts.AutoFollow && !opts.FollowMembers
}

func dedupeProfileUsers(users []*twitter.User) []*twitter.User {
	if len(users) <= 1 {
		return users
	}

	seenByScreenName := make(map[string]struct{}, len(users))
	seenByID := make(map[uint64]struct{}, len(users))
	seenByPointer := make(map[*twitter.User]struct{}, len(users))
	deduped := make([]*twitter.User, 0, len(users))
	for _, user := range users {
		if user == nil {
			continue
		}
		screenName := strings.ToLower(strings.TrimSpace(user.ScreenName))
		if screenName != "" {
			if _, ok := seenByScreenName[screenName]; ok {
				continue
			}
		}
		if user.Id != 0 {
			if _, ok := seenByID[user.Id]; ok {
				continue
			}
		}
		if screenName == "" && user.Id == 0 {
			if _, ok := seenByPointer[user]; ok {
				continue
			}
			seenByPointer[user] = struct{}{}
		}
		if screenName != "" {
			seenByScreenName[screenName] = struct{}{}
		}
		if user.Id != 0 {
			seenByID[user.Id] = struct{}{}
		}
		deduped = append(deduped, user)
	}
	return deduped
}

// initDownloader 初始化下载器组件，返回 versionManager, fileWriter, downloader
func (s *downloadServiceImpl) initDownloader() (*downloader.DefaultVersionManager, *downloader.DefaultFileWriter, *downloader.DefaultDownloader) {
	versionManager := downloader.NewVersionManagerWithWriter(".versions", nil)
	fileWriter := downloader.NewFileWriter(versionManager)
	dwn := downloader.NewDownloader(fileWriter)
	return versionManager, fileWriter, dwn
}

// downloadTemplateConfig 封装下载流程模板方法的差异点配置
type downloadTemplateConfig struct {
	TaskID   string
	Opts     DownloadOptions
	Reporter ProgressReporter

	Prepare func(ctx context.Context, pathHelper *path.StorePath) (
		users []*twitter.User,
		lists []twitter.ListBase,
		err error,
	)

	ReportBeforeDownload  func(taskID string, reporter ProgressReporter)
	ShouldDownloadProfile func(users []*twitter.User) bool
	ProfileIdentifier     string
	CompletionMessage     string
}

func (s *downloadServiceImpl) executeDownloadTemplate(ctx context.Context, config downloadTemplateConfig) error {
	reporter := s.getReporterOrDefault(config.Reporter)
	start := time.Now()
	log.Infof("[download] Start task_id=%s options=%s", config.TaskID, downloadOptionsSummary(config.Opts))

	config.ReportBeforeDownload(config.TaskID, reporter)

	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		log.Errorf("[download] Store path failed task_id=%s error=%q", config.TaskID, safeDownloadError(err))
		return fmt.Errorf("failed to make store dir [task=%s]: %w", config.TaskID, err)
	}
	log.Debugf("[download] Store path ready root=%q", logging.Path(pathHelper.Root))

	dumper := downloading.NewDumper()
	s.loadDumperSafely(dumper, pathHelper.ErrorsPath)
	defer s.saveDumper(dumper, pathHelper.ErrorsPath)

	users, lists, err := config.Prepare(ctx, pathHelper)
	if err != nil {
		log.Errorf("[download] Prepare failed task_id=%s error=%q", config.TaskID, safeDownloadError(err))
		return err
	}
	log.Infof("[download] Prepared users=%d lists=%d", len(users), len(lists))

	versionManager, fileWriter, dwn := s.initDownloader()
	progress := s.newBatchProgressCallback(config.TaskID, reporter)
	retryProgress := s.newRetryProgressCallback(config.TaskID, reporter)
	runtimeOptions := s.runtimeOptions()

	log.Infof("[download] Media batch start task_id=%s users=%d lists=%d workers=%d", config.TaskID, len(users), len(lists), runtimeOptions.MaxDownloadRoutine)
	failedTweets, listMembers, summary, err := downloading.BatchDownloadAny(
		ctx, s.deps.Client, s.deps.DB, lists, users,
		pathHelper.Root, pathHelper.Users, effectiveAutoFollow(config.Opts),
		s.deps.AdditionalClients, dwn, fileWriter, runtimeOptions, progress,
		s.deps.ListSyncManager,
	)
	if err != nil {
		log.Errorf("[download] Media batch failed task_id=%s error=%q", config.TaskID, safeDownloadError(err))
		return err
	}
	log.Infof("[download] Media batch complete entities=%d failed_tweets=%d list_members=%d dur=%s", summary.TotalEntities, len(failedTweets), len(listMembers), time.Since(start))

	if config.Opts.FollowMembers {
		followTargets := make([]*twitter.User, 0, len(users)+len(listMembers))
		followTargets = append(followTargets, users...)
		followTargets = append(followTargets, listMembers...)
		log.Infof("[download] Follow members start task_id=%s targets=%d", config.TaskID, len(followTargets))
		if err := s.followMembersIfNeeded(ctx, followTargets); err != nil {
			log.Errorf("[download] Follow members failed task_id=%s targets=%d error=%q", config.TaskID, len(followTargets), safeDownloadError(err))
			return err
		}
		log.Infof("[download] Follow members complete targets=%d", len(followTargets))
	}
	mainFailures := collectFailedTweetSet(failedTweets)

	s.collectFailedTweets(dumper, failedTweets)
	if !config.Opts.NoRetry {
		pendingTweets := dumper.Count()
		if pendingTweets == 0 {
			log.Debug("[download] Retry skipped reason=no_pending_tweets")
		} else {
			log.Infof("[download] Retry start task_id=%s pending_tweets=%d", config.TaskID, pendingTweets)
			retrySummary, retryErr := downloading.RetryFailedTweets(
				ctx, dumper, s.deps.DB, s.deps.Client, dwn, fileWriter, runtimeOptions, retryProgress,
			)
			if retryErr != nil {
				log.Warnf("[download] Retry failed task_id=%s error=%q", config.TaskID, safeDownloadError(retryErr))
			} else {
				log.Infof("[download] Retry complete entities=%d remaining_entities=%d remaining_tweets=%d", retrySummary.TotalEntities, retrySummary.RemainingEntities, dumper.Count())
			}
		}
	} else {
		pendingTweets := dumper.Count()
		if pendingTweets > 0 {
			log.Warnf("[download] Retry skipped reason=no_retry pending_tweets=%d", pendingTweets)
		} else {
			log.Debug("[download] Retry skipped reason=no_retry pending_tweets=0")
		}
	}

	var profileResult *ProfileResult
	profileWarning := ""

	profileTargetUsers := dedupeProfileUsers(append(append([]*twitter.User(nil), users...), listMembers...))

	if config.ShouldDownloadProfile(profileTargetUsers) && len(profileTargetUsers) > 0 {
		log.Infof("[download] Profile start task_id=%s target=%q users=%d", config.TaskID, config.ProfileIdentifier, len(profileTargetUsers))
		profileResult, err = s.downloadProfile(
			ctx, config.TaskID, profileTargetUsers,
			pathHelper, versionManager, fileWriter, dwn, reporter,
		)
		if err != nil {
			log.Warnf("[download] Profile failed task_id=%s target=%q error=%q", config.TaskID, config.ProfileIdentifier, safeDownloadError(err))
			reporter.OnProgress(config.TaskID, Progress{
				Stage:   "profile_warning",
				Current: fmt.Sprintf("profile failed for %s: %v", config.ProfileIdentifier, err),
			})
			profileWarning = "with profile warnings"
		} else if profileResult != nil {
			log.Infof("[download] Profile complete users=%d downloaded=%d failed=%d versioned=%d", len(profileTargetUsers), profileResult.Downloaded, profileResult.Failed, profileResult.Versioned)
		}
	} else if len(profileTargetUsers) == 0 {
		log.Debug("[download] Profile skipped reason=no_users")
	} else {
		log.Infof("[download] Profile skipped reason=skip_profile users=%d", len(profileTargetUsers))
	}

	s.completeTask(config.TaskID, reporter, config.CompletionMessage, &Result{
		Main:    s.buildMainDownloadResult(summary, countRemainingFailedEntities(dumper, mainFailures)),
		Profile: cloneProfileResult(profileResult),
	}, profileWarning)
	log.Infof("[download] Complete dur=%s", time.Since(start))

	return nil
}

// UserDownload 下载用户推文
func (s *downloadServiceImpl) UserDownload(ctx context.Context, taskID string, screenName string, opts DownloadOptions, reporter ProgressReporter) error {
	return s.executeDownloadTemplate(ctx, downloadTemplateConfig{
		TaskID:            taskID,
		Opts:              opts,
		Reporter:          reporter,
		ProfileIdentifier: screenName,
		CompletionMessage: "User download completed",

		ReportBeforeDownload: func(tid string, r ProgressReporter) {
			r.OnProgress(tid, Progress{Stage: "downloading", Current: screenName})
		},

		Prepare: func(ctx context.Context, ph *path.StorePath) ([]*twitter.User, []twitter.ListBase, error) {
			user, uid, err := twitter.GetUserByScreenName(ctx, s.deps.Client, s.deps.AdditionalClients, screenName)
			if err != nil {
				database.MarkUserInaccessible(s.deps.DB, uid, screenName)
				return nil, nil, err
			}
			return []*twitter.User{user}, nil, nil
		},

		ShouldDownloadProfile: func(_ []*twitter.User) bool {
			return !opts.SkipProfile
		},
	})
}

// ListDownload 下载列表推文
func (s *downloadServiceImpl) ListDownload(ctx context.Context, taskID string, listID uint64, opts DownloadOptions, reporter ProgressReporter) error {
	return s.executeDownloadTemplate(ctx, downloadTemplateConfig{
		TaskID:            taskID,
		Opts:              opts,
		Reporter:          reporter,
		ProfileIdentifier: fmt.Sprintf("list %d", listID),
		CompletionMessage: "List download completed",

		ReportBeforeDownload: func(tid string, r ProgressReporter) {
			r.OnProgress(tid, Progress{Stage: "syncing", Current: fmt.Sprintf("list:%d", listID)})
			r.OnProgress(tid, Progress{Stage: "downloading", Current: fmt.Sprintf("list:%d", listID)})
		},

		Prepare: func(ctx context.Context, ph *path.StorePath) ([]*twitter.User, []twitter.ListBase, error) {
			list, err := twitter.GetLst(ctx, s.deps.Client, listID)
			if err != nil {
				return nil, nil, err
			}
			return nil, []twitter.ListBase{list}, nil
		},

		ShouldDownloadProfile: func(_ []*twitter.User) bool {
			return !opts.SkipProfile
		},
	})
}

// FollowingDownload 下载关注列表
func (s *downloadServiceImpl) FollowingDownload(ctx context.Context, taskID string, screenName string, opts DownloadOptions, reporter ProgressReporter) error {
	return s.executeDownloadTemplate(ctx, downloadTemplateConfig{
		TaskID:            taskID,
		Opts:              opts,
		Reporter:          reporter,
		ProfileIdentifier: fmt.Sprintf("following %s", screenName),
		CompletionMessage: "Following download completed",

		ReportBeforeDownload: func(tid string, r ProgressReporter) {
			r.OnProgress(tid, Progress{Stage: "downloading", Current: screenName})
		},

		Prepare: func(ctx context.Context, ph *path.StorePath) ([]*twitter.User, []twitter.ListBase, error) {
			user, uid, err := twitter.GetUserByScreenName(ctx, s.deps.Client, s.deps.AdditionalClients, screenName)
			if err != nil {
				database.MarkUserInaccessible(s.deps.DB, uid, screenName)
				return nil, nil, err
			}
			return nil, []twitter.ListBase{user.Following()}, nil
		},

		ShouldDownloadProfile: func(_ []*twitter.User) bool {
			return !opts.SkipProfile
		},
	})
}

// ProfileDownload 下载用户资料
func (s *downloadServiceImpl) ProfileDownload(ctx context.Context, taskID string, screenNames []string, reporter ProgressReporter) error {
	reporter = s.getReporterOrDefault(reporter)

	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		return err
	}

	versionManager, fileWriter, dwn := s.initDownloader()

	unique := make([]string, 0)
	seen := make(map[string]struct{})
	for _, name := range screenNames {
		if _, ok := seen[name]; !ok {
			seen[name] = struct{}{}
			unique = append(unique, name)
		}
	}
	users, failures := s.resolveUsers(ctx, unique)
	if len(failures) > 0 {
		parts := make([]string, 0, len(failures))
		for _, f := range failures {
			parts = append(parts, fmt.Sprintf("%s[%s]: %s", f.Kind, f.Identifier, safeDownloadError(f.Err)))
		}
		log.Warnf("[download] Resolve failures count=%d details=%q", len(failures), strings.Join(parts, "; "))
	}
	if len(unique) > 0 && len(users) == 0 {
		log.Warnf("[download] Resolve failed target=profile_users reason=all_failed")
		return fmt.Errorf("all profile users failed to resolve [task=%s]", taskID)
	}

	log.Infof("[download] Profile start task_id=%s users=%d", taskID, len(users))
	profileResult, err := s.downloadProfile(ctx, taskID, users, pathHelper, versionManager, fileWriter, dwn, reporter)
	if err != nil {
		return err
	}

	s.completeProfileTask(taskID, reporter, profileResult)
	return nil
}

// ListProfileDownload 下载列表用户资料
func (s *downloadServiceImpl) ListProfileDownload(ctx context.Context, taskID string, listID uint64, reporter ProgressReporter) error {
	reporter = s.getReporterOrDefault(reporter)

	reporter.OnProgress(taskID, Progress{Stage: "syncing", Current: fmt.Sprintf("list:%d", listID)})

	// 获取列表成员
	// 列表是用户私有资源，只能用主账号查询，不走多账号轮询
	list, err := twitter.GetLst(ctx, s.deps.Client, listID)
	if err != nil {
		return err
	}

	membersResult, err := list.GetMembers(ctx, s.deps.Client)
	if err != nil {
		return err
	}

	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		log.Errorf("[download] Store path failed task_id=%s error=%q", taskID, safeDownloadError(err))
		return err
	}
	versionManager, fileWriter, dwn := s.initDownloader()

	users := dedupeProfileUsers(membersResult.Users)

	log.Infof("[download] Profile start task_id=%s target=list:%d users=%d", taskID, listID, len(users))
	profileResult, err := s.downloadProfile(ctx, taskID, users, pathHelper, versionManager, fileWriter, dwn, reporter)
	if err != nil {
		return err
	}

	s.completeProfileTask(taskID, reporter, profileResult)

	return nil
}

// MarkDownloaded 标记已下载
func (s *downloadServiceImpl) MarkDownloaded(ctx context.Context, taskID string, screenNames []string, listIDs []uint64, followingNames []string, markTime *string, reporter ProgressReporter) error {
	reporter = s.getReporterOrDefault(reporter)

	log.Infof("[download] Mark start task_id=%s users=%d lists=%d following=%d", taskID, len(screenNames), len(listIDs), len(followingNames))
	reporter.OnProgress(taskID, Progress{Stage: "resolving"})

	users, userFailures := s.resolveUsers(ctx, screenNames)
	lists, listFailures := s.resolveLists(ctx, listIDs)
	followingLists, followingFailures := s.resolveFollowings(ctx, followingNames)
	lists = append(lists, followingLists...)

	// 日志汇总所有解析失败明细
	allFailures := append(append(userFailures, listFailures...), followingFailures...)
	if len(allFailures) > 0 {
		parts := make([]string, 0, len(allFailures))
		for _, f := range allFailures {
			parts = append(parts, fmt.Sprintf("%s[%s]: %s", f.Kind, f.Identifier, safeDownloadError(f.Err)))
		}
		log.Warnf("[download] Resolve failures count=%d details=%q", len(allFailures), strings.Join(parts, "; "))
	}

	if len(users) == 0 && len(lists) == 0 {
		log.Warn("[download] Mark skipped reason=no_resolved_targets")
		return fmt.Errorf("no users or lists to mark (all failed to resolve) [task=%s]", taskID)
	}

	reporter.OnProgress(taskID, Progress{Stage: "marking", Total: len(users) + len(lists), Current: fmt.Sprintf("%d users, %d lists", len(users), len(lists))})

	// 构建参数
	var markTimeStr string
	if markTime != nil {
		markTimeStr = *markTime
	}

	// 执行标记
	// 注意：MarkUsersAsDownloaded 内部会自动获取列表成员并标记
	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		log.Errorf("[download] Store path failed task_id=%s error=%q", taskID, safeDownloadError(err))
		return err
	}

	results, err := downloading.MarkUsersAsDownloaded(ctx, s.deps.Client, s.deps.DB, lists, users, pathHelper.Users, markTimeStr, s.maxFileNameLen())
	if err != nil {
		return err
	}

	reporter.OnComplete(taskID, Result{Message: fmt.Sprintf("Marked %d users as downloaded", len(results))})
	return nil
}

// JsonFileDownload 从第三方工具导出的JSON文件下载推文媒体
// 支持推文搜索结果格式（包含 media 数组）
// noRetry=true 时跳过重试，失败项仍会持久化到 json_errors.json 供下次运行使用
func (s *downloadServiceImpl) JsonFileDownload(ctx context.Context, taskID string, paths []string, noRetry bool, reporter ProgressReporter) error {
	reporter = s.getReporterOrDefault(reporter)

	log.Infof("[download] JSON file start task_id=%s files=%d no_retry=%t", taskID, len(paths), noRetry)
	reporter.OnProgress(taskID, Progress{Stage: "downloading", Total: len(paths), Current: fmt.Sprintf("%d JSON files", len(paths))})

	if err := s.validateJsonPaths(paths); err != nil {
		log.Errorf("[download] JSON path validation failed task_id=%s kind=file error=%q", taskID, safeDownloadError(err))
		return err
	}

	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		log.Errorf("[download] Store path failed task_id=%s error=%q", taskID, safeDownloadError(err))
		return err
	}
	_, fileWriter, dwn := s.initDownloader()

	jsonDumper := downloading.NewJsonDumper()
	s.loadJsonDumperSafely(jsonDumper, pathHelper.JSONErrorsPath)
	defer s.saveJsonDumper(jsonDumper, pathHelper.JSONErrorsPath)

	retryProgress := s.newRetryProgressCallback(taskID, reporter)

	runtimeOptions := s.runtimeOptions()
	results, failedBySource := downloading.DownloadThirdPartyTweets(ctx, s.deps.Client, pathHelper.Users, dwn, fileWriter, runtimeOptions, paths...)

	s.collectJsonFailedTweets(jsonDumper, failedBySource, "file")

	if !noRetry {
		if _, err := downloading.RetryFailedJsonTweets(ctx, jsonDumper, s.deps.Client, dwn, fileWriter, runtimeOptions, retryProgress); err != nil {
			log.Warnf("[download] Retry failed task_id=%s kind=json error=%q", taskID, safeDownloadError(err))
		}
	}

	var successCount, failCount, totalMedia int
	for _, r := range results {
		if r.Success {
			successCount++
			totalMedia += r.MediaCount
		} else {
			failCount++
		}
	}

	reporter.OnComplete(taskID, Result{
		Main: &MainResult{
			Downloaded: successCount,
			Failed:     failCount,
		},
		Message: fmt.Sprintf("JSON file download: %d success, %d failed, %d media", successCount, failCount, totalMedia),
	})
	return nil
}

// JsonFolderDownload 从TMD生成的.loongtweet文件夹下载推文媒体
// noRetry=true 时跳过重试，失败项仍会持久化到 json_errors.json 供下次运行使用
func (s *downloadServiceImpl) JsonFolderDownload(ctx context.Context, taskID string, paths []string, noRetry bool, reporter ProgressReporter) error {
	reporter = s.getReporterOrDefault(reporter)

	log.Infof("[download] JSON folder start task_id=%s folders=%d no_retry=%t", taskID, len(paths), noRetry)
	reporter.OnProgress(taskID, Progress{Stage: "downloading", Total: len(paths), Current: fmt.Sprintf("%d loongtweet folders", len(paths))})

	if err := s.validateJsonPaths(paths); err != nil {
		log.Errorf("[download] JSON path validation failed task_id=%s kind=folder error=%q", taskID, safeDownloadError(err))
		return err
	}

	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		log.Errorf("[download] Store path failed task_id=%s error=%q", taskID, safeDownloadError(err))
		return err
	}
	_, fileWriter, dwn := s.initDownloader()

	jsonDumper := downloading.NewJsonDumper()
	s.loadJsonDumperSafely(jsonDumper, pathHelper.JSONErrorsPath)
	defer s.saveJsonDumper(jsonDumper, pathHelper.JSONErrorsPath)

	retryProgress := s.newRetryProgressCallback(taskID, reporter)

	runtimeOptions := s.runtimeOptions()
	results, failedBySource := downloading.DownloadFromLoongTweetFolder(ctx, s.deps.Client, pathHelper.Users, dwn, fileWriter, runtimeOptions, paths...)

	s.collectJsonFailedTweets(jsonDumper, failedBySource, "folder")

	if !noRetry {
		if _, err := downloading.RetryFailedJsonTweets(ctx, jsonDumper, s.deps.Client, dwn, fileWriter, runtimeOptions, retryProgress); err != nil {
			log.Warnf("[download] Retry failed task_id=%s kind=json error=%q", taskID, safeDownloadError(err))
		}
	}

	var successCount, failCount int
	for _, r := range results {
		if r.Success {
			successCount++
		} else {
			failCount++
		}
	}

	reporter.OnComplete(taskID, Result{
		Main: &MainResult{
			Downloaded: successCount,
			Failed:     failCount,
		},
		Message: fmt.Sprintf("JSON folder download: %d success, %d failed", successCount, failCount),
	})
	return nil
}

// BatchDownload 批量下载
func (s *downloadServiceImpl) BatchDownload(ctx context.Context, taskID string, screenNames []string, listIDs []uint64, followingNames []string, opts DownloadOptions, reporter ProgressReporter) error {
	return s.executeDownloadTemplate(ctx, downloadTemplateConfig{
		TaskID:            taskID,
		Opts:              opts,
		Reporter:          reporter,
		ProfileIdentifier: "batch",
		CompletionMessage: "Batch download completed",

		ReportBeforeDownload: func(tid string, r ProgressReporter) {
			r.OnProgress(tid, Progress{Stage: "resolving"})
		},

		Prepare: func(ctx context.Context, ph *path.StorePath) ([]*twitter.User, []twitter.ListBase, error) {
			users, userFailures := s.resolveUsers(ctx, screenNames)
			lists, listFailures := s.resolveLists(ctx, listIDs)
			followingLists, followingFailures := s.resolveFollowings(ctx, followingNames)
			lists = append(lists, followingLists...)

			// 日志汇总所有解析失败明细
			allFailures := append(append(userFailures, listFailures...), followingFailures...)
			if len(allFailures) > 0 {
				parts := make([]string, 0, len(allFailures))
				for _, f := range allFailures {
					parts = append(parts, fmt.Sprintf("%s[%s]: %s", f.Kind, f.Identifier, safeDownloadError(f.Err)))
				}
				log.Warnf("[download] Resolve failures count=%d details=%q", len(allFailures), strings.Join(parts, "; "))
			}

			if len(users) == 0 && len(lists) == 0 {
				log.Warn("[download] Resolve failed target=batch reason=all_failed")
				return nil, nil, fmt.Errorf("all users and lists failed to resolve [task=%s]", taskID)
			}
			return users, lists, nil
		},

		ShouldDownloadProfile: func(_ []*twitter.User) bool {
			return !opts.SkipProfile
		},
	})
}

// saveDumper 保存 Dumper 到文件（直接覆写，不做 load-merge，确保 Remove 操作被持久化）。
// 调用方应在锁外完成所有 Push/Remove 操作后，再将 dumper 传入此处一次性写入。
func (s *downloadServiceImpl) saveDumper(dumper *downloading.TweetDumper, path string) {
	s.dumperMu.Lock()
	defer s.dumperMu.Unlock()

	if dumper.Count() > 0 {
		if err := dumper.Dump(path); err != nil {
			log.Warnf("[download] Dumper save failed kind=regular path=%q tweets=%d error=%q", logging.Path(path), dumper.Count(), safeDownloadError(err))
		} else {
			log.Infof("[download] Dumper saved kind=regular path=%q tweets=%d", logging.Path(path), dumper.Count())
		}
		return
	}
	_ = os.Remove(path)
}

// RetryAllFailed 重试所有历史失败推文
func (s *downloadServiceImpl) RetryAllFailed(ctx context.Context, taskID string, reporter ProgressReporter) error {
	start := time.Now()
	log.Infof("[download] Retry all start task_id=%s", taskID)

	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		log.Errorf("[download] Store path failed task_id=%s error=%q", taskID, safeDownloadError(err))
		return fmt.Errorf("failed to create store path [task=%s]: %w", taskID, err)
	}

	_, fileWriter, dwn := s.initDownloader()
	runtimeOptions := s.runtimeOptions()

	// 两阶段独立执行：常规阶段失败不再跳过 JSON 阶段，最终用 errors.Join 聚合返回
	var errs []error

	// 第一阶段：重试常规下载错误
	regDumper := downloading.NewDumper()
	s.loadDumperSafely(regDumper, pathHelper.ErrorsPath)
	regularBefore := regDumper.Count()
	if regularBefore > 0 {
		if _, err := downloading.RetryFailedTweets(ctx, regDumper, s.deps.DB, s.deps.Client, dwn, fileWriter, runtimeOptions, nil); err != nil {
			log.Errorf("[download] Retry failed task_id=%s kind=regular error=%q", taskID, safeDownloadError(err))
			errs = append(errs, fmt.Errorf("regular: %w", err))
		} else {
			s.saveDumper(regDumper, pathHelper.ErrorsPath)
		}
	}

	// 第二阶段：重试 JSON 导入错误（无论第一阶段是否失败都执行）
	jsonDumper := downloading.NewJsonDumper()
	s.loadJsonDumperSafely(jsonDumper, pathHelper.JSONErrorsPath)
	jsonBefore := jsonDumper.Count()
	if jsonBefore > 0 {
		if _, err := downloading.RetryFailedJsonTweets(ctx, jsonDumper, s.deps.Client, dwn, fileWriter, runtimeOptions, nil); err != nil {
			log.Errorf("[download] Retry failed task_id=%s kind=json error=%q", taskID, safeDownloadError(err))
			errs = append(errs, fmt.Errorf("json: %w", err))
		} else {
			s.saveJsonDumper(jsonDumper, pathHelper.JSONErrorsPath)
		}
	}

	regularAfter := regDumper.Count()
	jsonAfter := jsonDumper.Count()
	if len(errs) > 0 {
		log.Warnf("[download] Retry all incomplete regular_tweets=%d remaining_regular=%d json_tweets=%d remaining_json=%d dur=%s errors=%d", regularBefore, regularAfter, jsonBefore, jsonAfter, time.Since(start), len(errs))
		return errors.Join(errs...)
	}
	if regularBefore == 0 && jsonBefore == 0 {
		log.Infof("[download] Retry all skipped reason=no_pending_errors dur=%s", time.Since(start))
	} else {
		log.Infof("[download] Retry all complete regular_tweets=%d remaining_regular=%d json_tweets=%d remaining_json=%d dur=%s", regularBefore, regularAfter, jsonBefore, jsonAfter, time.Since(start))
	}
	reporter.OnComplete(taskID, Result{Message: "completed"})
	return nil
}

// ClearErrors 清除所有失败推文记录
func (s *downloadServiceImpl) ClearErrors() error {
	pathHelper, err := path.NewStorePath(s.deps.Config.RootPath)
	if err != nil {
		log.Errorf("[download] Store path failed operation=clear_errors error=%q", safeDownloadError(err))
		return fmt.Errorf("failed to create store path: %w", err)
	}

	s.dumperMu.Lock()
	_ = os.Remove(pathHelper.ErrorsPath)
	_ = os.Remove(pathHelper.JSONErrorsPath)
	s.dumperMu.Unlock()
	return nil
}

// collectFailedTweets 收集失败的推文到 Dumper
func (s *downloadServiceImpl) collectFailedTweets(dumper *downloading.TweetDumper, failedTweets []*downloading.TweetInEntity) {
	for _, tweet := range failedTweets {
		if tweet == nil || tweet.Tweet == nil || tweet.Entity == nil {
			continue
		}
		if id, err := tweet.Entity.Id(); err == nil {
			dumper.Push(id, tweet.Tweet)
		}
	}
}

// collectJsonFailedTweets 收集 JSON 下载失败的推文到 JsonTweetDumper（保留 dir 用于重试时定位用户目录）
func (s *downloadServiceImpl) collectJsonFailedTweets(dumper *downloading.JsonTweetDumper, failedBySource map[string][]downloading.JsonPackagedTweet, entryType string) {
	for sourcePath, items := range failedBySource {
		for _, item := range items {
			dumper.PushWithDir(sourcePath, entryType, item.Dir, item.Tweet)
		}
	}
}

// saveJsonDumper 保存 JsonTweetDumper 到文件（直接覆写，不做 load-merge）。
func (s *downloadServiceImpl) saveJsonDumper(dumper *downloading.JsonTweetDumper, path string) {
	s.dumperMu.Lock()
	defer s.dumperMu.Unlock()

	if dumper.Count() > 0 {
		if err := dumper.Dump(path); err != nil {
			log.Warnf("[download] Dumper save failed kind=json path=%q tweets=%d error=%q", logging.Path(path), dumper.Count(), safeDownloadError(err))
		} else {
			log.Infof("[download] Dumper saved kind=json path=%q tweets=%d", logging.Path(path), dumper.Count())
		}
		return
	}
	_ = os.Remove(path)
}

// loadDumperSafely 安全加载 TweetDumper。
// 注意：dumper.Load 内部已处理 os.IsNotExist（文件不存在时返回 nil），
//
//	所以这里 err 一定意味着文件损坏或读取错误，记录明确日志即可。
func (s *downloadServiceImpl) loadDumperSafely(dumper *downloading.TweetDumper, path string) {
	s.dumperMu.Lock()
	defer s.dumperMu.Unlock()
	if err := dumper.Load(path); err != nil {
		log.Warnf("[download] Dumper load failed kind=regular path=%q action=recreate_from_memory error=%q", logging.Path(path), safeDownloadError(err))
	}
}

// loadJsonDumperSafely 安全加载 JsonTweetDumper，同 loadDumperSafely。
func (s *downloadServiceImpl) loadJsonDumperSafely(dumper *downloading.JsonTweetDumper, path string) {
	s.dumperMu.Lock()
	defer s.dumperMu.Unlock()
	if err := dumper.Load(path); err != nil {
		log.Warnf("[download] Dumper load failed kind=json path=%q action=recreate_from_memory error=%q", logging.Path(path), safeDownloadError(err))
	}
}

// 内部辅助方法：下载 Profile
func (s *downloadServiceImpl) downloadProfile(ctx context.Context, taskID string, users []*twitter.User, pathHelper *path.StorePath, versionManager downloader.VersionManager, fileWriter downloader.FileWriter, dwn downloader.Downloader, reporter ProgressReporter) (*ProfileResult, error) {
	users = dedupeProfileUsers(users)
	if len(users) == 0 {
		return nil, nil
	}

	reporter.OnProgress(taskID, Progress{Stage: "profile", Total: len(users), Current: users[0].ScreenName})

	// 创建 storage manager
	storage, err := profile.NewFileStorageManager(pathHelper.Users)
	if err != nil {
		log.Errorf("[profile] Storage manager create failed task_id=%s path=%q error=%q", taskID, logging.Path(pathHelper.Users), safeDownloadError(err))
		return nil, fmt.Errorf("failed to create profile storage: %w", err)
	}
	storage.SetVersionManager(versionManager)

	// 创建 profile 下载器（使用 DB 版本以同步用户实体信息）
	pd := profile.NewProfileDownloaderWithDB(
		s.profileDownloaderConfig(),
		storage,
		append([]*resty.Client{s.deps.Client}, s.deps.AdditionalClients...),
		s.deps.DB,
		dwn,
		fileWriter,
	)
	pd.SetProgressCallback(func(progress profile.DownloadProgress) {
		reporter.OnProgress(taskID, Progress{
			Stage:     "profile",
			Total:     progress.Total,
			Completed: progress.Completed,
			Failed:    progress.Failed,
			Current:   progress.Current,
		})
	})

	// 构建下载请求
	requests := make([]profile.DownloadRequest, len(users))
	for i, user := range users {
		requests[i] = profile.DownloadRequest{
			ScreenName:  user.ScreenName,
			UserTitle:   user.Title(),
			Name:        user.Name,
			UserID:      user.Id,
			AvatarURL:   user.AvatarURL,
			BannerURL:   user.BannerURL,
			Description: user.Description,
			Location:    user.Location,
			URL:         user.URL,
			Verified:    user.Verified,
			Protected:   user.IsProtected,
			CreatedAt:   user.CreatedAt,
		}
	}

	// 执行批量下载
	results := pd.DownloadMultiple(ctx, requests)

	// 统计结果
	var successCount, failCount, versionedFileCount int
	var avatarFailed, bannerFailed int
	var firstErr error
	var failedDetails []string // 收集失败明细，用于完整日志记录
	for i, result := range results {
		if result == nil {
			failCount++
			if firstErr == nil {
				firstErr = fmt.Errorf("profile download returned nil result")
			}
			// 通过 requests 索引获取 screenName，保留失败明细
			if i < len(requests) {
				failedDetails = append(failedDetails, fmt.Sprintf("@%s: nil result", requests[i].ScreenName))
			} else {
				failedDetails = append(failedDetails, fmt.Sprintf("request[%d]: nil result", i))
			}
			continue
		}

		// 统计单个用户维度
		if result.Error != nil {
			failCount++
			if firstErr == nil {
				firstErr = result.Error
			}
			// 收集失败用户和原因
			screenName := ""
			if i < len(requests) {
				screenName = requests[i].ScreenName
			}
			failedDetails = append(failedDetails, fmt.Sprintf("@%s: %v", screenName, result.Error))
		} else if result.Success {
			successCount++
		}

		// 跨所有用户统计 avatar/banner 文件级失败
		for _, file := range result.Files {
			if file.Versioned {
				versionedFileCount++
			}
			if file.Status != profile.StatusFailed {
				continue
			}
			switch file.FileType {
			case profile.FileTypeAvatar:
				avatarFailed++
			case profile.FileTypeBanner:
				bannerFailed++
			}
		}
	}

	profileResult := &ProfileResult{
		Downloaded: successCount,
		Failed:     failCount,
		Versioned:  versionedFileCount,
	}

	// 输出完整失败明细日志（即使部分失败也仍返回 nil，但日志记录所有失败用户和原因）
	if len(failedDetails) > 0 {
		log.Warnf("[profile] Failed users count=%d total=%d details=%q",
			len(failedDetails), len(results), strings.Join(failedDetails, "; "))
	}

	if avatarFailed > 0 || bannerFailed > 0 {
		var fileParts []string
		if avatarFailed > 0 {
			fileParts = append(fileParts, fmt.Sprintf("%d avatars", avatarFailed))
		}
		if bannerFailed > 0 {
			fileParts = append(fileParts, fmt.Sprintf("%d banners", bannerFailed))
		}
		log.Warnf("[profile] Download complete users=%d total=%d failed_files=%q", successCount, len(results), strings.Join(fileParts, ", "))
	} else if len(results) > 0 {
		log.Debugf("[profile] Download complete users=%d total=%d", successCount, len(results))
	}

	if successCount == 0 && failCount > 0 {
		if firstErr == nil {
			firstErr = fmt.Errorf("unknown profile download error")
		}
		return profileResult, fmt.Errorf("profile download failed for all %d users: %w", failCount, firstErr)
	}

	return profileResult, nil
}

func formatProfileCompletionMessage(result ProfileResult) string {
	return fmt.Sprintf(
		"Profile download completed: %d success, %d failed, %d versioned files",
		result.Downloaded,
		result.Failed,
		result.Versioned,
	)
}

func cloneProfileResult(result *ProfileResult) *ProfileResult {
	if result == nil {
		return nil
	}
	clone := *result
	return &clone
}

// validateJsonPaths 检查 paths 是否在允许的根目录之内，防止路径穿越
func (s *downloadServiceImpl) validateJsonPaths(paths []string) error {
	rootPath := filepath.Clean(s.deps.Config.RootPath)
	var allowedPrefixes []string
	allowedPrefixes = append(allowedPrefixes, rootPath+string(filepath.Separator))
	allowedPrefixes = append(allowedPrefixes, rootPath)
	if s.deps.AppRootPath != "" {
		appRoot := filepath.Clean(s.deps.AppRootPath)
		allowedPrefixes = append(allowedPrefixes, appRoot+string(filepath.Separator))
		allowedPrefixes = append(allowedPrefixes, appRoot)
	}

	for _, p := range paths {
		clean := filepath.Clean(p)
		allowed := false
		for _, prefix := range allowedPrefixes {
			if strings.HasPrefix(clean, prefix) {
				allowed = true
				break
			}
		}
		if !allowed {
			return fmt.Errorf("path %q is outside allowed directories", p)
		}
	}
	return nil
}
