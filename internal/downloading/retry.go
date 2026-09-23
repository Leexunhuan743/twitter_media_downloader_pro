package downloading

import (
	"context"
	"fmt"
	"sync/atomic"

	"github.com/go-resty/resty/v2"
	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/downloader"
)

type RetryProgress struct {
	Total     int
	Completed int
	Failed    int
}

type RetryProgressFunc func(progress RetryProgress)

type RetrySummary struct {
	TotalEntities     int
	RemainingEntities int
}

func RetryFailedTweets(ctx context.Context, dumper *TweetDumper, db *sqlx.DB, client *resty.Client, dwn downloader.Downloader, fileWriter downloader.FileWriter, opts RuntimeOptions, progress RetryProgressFunc) (RetrySummary, error) {
	if dumper.Count() == 0 {
		return RetrySummary{}, nil
	}
	totalEntities := dumper.EntityCount()

	log.Infof("[download] Retry load regular entities=%d tweets=%d", totalEntities, dumper.Count())
	legacy, err := dumper.GetTotal(db)
	if err != nil {
		return RetrySummary{}, err
	}

	toretry := make([]PackagedTweet, 0, len(legacy))
	for _, leg := range legacy {
		if leg.Tweet == nil {
			continue
		}
		if len(leg.Tweet.Urls) > 0 {
			toretry = append(toretry, leg)
		}
	}

	if len(toretry) == 0 {
		log.Infof("[download] Retry skip regular reason=no_tweets entities=%d", totalEntities)
		return RetrySummary{}, nil
	}

	log.Infof("[download] Retry start regular tweets=%d media=%d entities=%d", len(toretry), countTotalUrls(toretry), totalEntities)
	totalTweets := len(toretry)

	failedSet, completed := downloadRetryBatch(ctx, client, dwn, fileWriter, opts, progress, toretry, totalTweets)

	classifyRetryResults(toretry, failedSet, retryClassifier{
		resolve: func(pt PackagedTweet) (any, bool, string) {
			te, ok := pt.(*TweetInEntity)
			if !ok || te == nil || te.Tweet == nil || te.Entity == nil {
				return nil, true, ""
			}
			eid, err := te.Entity.Id()
			if err != nil {
				return nil, true, fmt.Sprintf("reason=entity_id_error error=%q", err.Error())
			}
			return eid, false, ""
		},
		remove: func(pt PackagedTweet, key any) bool {
			te, ok := pt.(*TweetInEntity)
			if !ok || te == nil || te.Tweet == nil {
				return false
			}
			eid, ok := key.(int)
			if !ok {
				return false
			}
			return dumper.Remove(eid, te.Tweet.Id)
		},
	})

	summary := RetrySummary{
		TotalEntities:     totalEntities,
		RemainingEntities: dumper.EntityCount(),
	}
	if progress != nil {
		progress(RetryProgress{
			Total:     totalTweets,
			Completed: int(completed),
			Failed:    dumper.Count(),
		})
	}
	log.Infof("[download] Retry complete regular tweets=%d remaining_tweets=%d entities=%d remaining_entities=%d", totalTweets, dumper.Count(), summary.TotalEntities, summary.RemainingEntities)
	return summary, nil
}

// countTotalUrls 统计所有推文中需要下载的URL总数
func countTotalUrls(tweets []PackagedTweet) int {
	count := 0
	for _, pt := range tweets {
		if pt.GetTweet() != nil {
			count += len(pt.GetTweet().Urls)
		}
	}
	return count
}

func RetryFailedJsonTweets(ctx context.Context, dumper *JsonTweetDumper, client *resty.Client, dwn downloader.Downloader, fileWriter downloader.FileWriter, opts RuntimeOptions, progress RetryProgressFunc) (RetrySummary, error) {
	if dumper.Count() == 0 {
		return RetrySummary{}, nil
	}
	totalEntries := dumper.EntryCount()

	log.Infof("[download] Retry load json entries=%d tweets=%d", totalEntries, dumper.Count())
	legacy := dumper.GetTotal()

	toretry := make([]PackagedTweet, 0, len(legacy))
	noUrlTweetIDs := make([]uint64, 0)
	for _, pt := range legacy {
		if pt.GetTweet() == nil {
			continue
		}
		if len(pt.GetTweet().Urls) > 0 {
			toretry = append(toretry, pt)
		} else {
			noUrlTweetIDs = append(noUrlTweetIDs, pt.GetTweet().Id)
		}
	}

	if len(toretry) == 0 {
		log.Infof("[download] Retry skip json reason=no_tweets entries=%d", totalEntries)
		return RetrySummary{}, nil
	}

	tweetIDToSources := make(map[uint64][]string, len(toretry))
	for sourcePath, ids := range dumper.set {
		for id := range ids {
			tweetIDToSources[id] = append(tweetIDToSources[id], sourcePath)
		}
	}

	log.Infof("[download] Retry start json tweets=%d media=%d entries=%d", len(toretry), countTotalUrls(toretry), totalEntries)
	totalTweets := len(toretry)

	failedSet, completed := downloadRetryBatch(ctx, client, dwn, fileWriter, opts, progress, toretry, totalTweets)

	classifyRetryResults(toretry, failedSet, retryClassifier{
		kindLabel: " json",
		resolve: func(pt PackagedTweet) (any, bool, string) {
			jpt, ok := pt.(JsonPackagedTweet)
			if !ok || jpt.Tweet == nil {
				return nil, true, ""
			}
			sources, exists := tweetIDToSources[jpt.Tweet.Id]
			if !exists || len(sources) == 0 {
				return nil, true, ""
			}
			return sources, false, ""
		},
		remove: func(pt PackagedTweet, key any) bool {
			jpt, ok := pt.(JsonPackagedTweet)
			if !ok || jpt.Tweet == nil {
				return false
			}
			sources, ok := key.([]string)
			if !ok {
				return false
			}
			// 同一推文可能被多个导出文件记录（例如重叠的搜索结果导出）。媒体只
			// 下一次，成功后必须从**所有**记录它的来源里摘除：此前用
			// map[id]source 单值映射，map 遍历序随机决定删哪一个，导致另一个来源
			// 的条目永久留在失败列表里（重试永远清不干净）。
			removed := false
			for _, sourcePath := range sources {
				if dumper.Remove(sourcePath, jpt.Tweet.Id) {
					removed = true
				}
			}
			return removed
		},
	})

	for _, id := range noUrlTweetIDs {
		// 无 URL 的条目不可重试（媒体链接已缺失），从所有记录它的来源摘除。
		for _, sourcePath := range tweetIDToSources[id] {
			dumper.Remove(sourcePath, id)
		}
	}

	summary := RetrySummary{
		TotalEntities:     totalEntries,
		RemainingEntities: dumper.EntryCount(),
	}
	if progress != nil {
		progress(RetryProgress{
			Total:     totalTweets,
			Completed: int(completed),
			Failed:    dumper.Count(),
		})
	}
	log.Infof("[download] Retry complete json tweets=%d remaining_tweets=%d entries=%d remaining_entries=%d", totalTweets, dumper.Count(), summary.TotalEntities, summary.RemainingEntities)
	return summary, nil
}

// retryClassifier carries the kind-specific bookkeeping used by
// classifyRetryResults after a retry pass: resolve maps each packaged tweet to
// its dumper removal key (skipping tweets that cannot be resolved), remove
// deletes a resolved tweet from the dumper.
type retryClassifier struct {
	kindLabel string // "" for regular, " json" for json — keeps legacy log text
	resolve   func(pt PackagedTweet) (key any, skip bool, skipReason string)
	remove    func(pt PackagedTweet, key any) bool
}

// downloadRetryBatch runs the shared retry download pass over toretry and
// returns the set of tweet IDs that still fail plus the completed callback
// count. Progress semantics are unified for both dumper kinds: Failed reports
// tweets that still need retry (failures plus in-flight), decremented as
// successes complete — previously the json variant reported only in-flight
// tweets, under-counting failures mid-run.
func downloadRetryBatch(ctx context.Context, client *resty.Client, dwn downloader.Downloader, fileWriter downloader.FileWriter, opts RuntimeOptions, progress RetryProgressFunc, toretry []PackagedTweet, totalTweets int) (map[uint64]struct{}, int64) {
	if progress != nil {
		progress(RetryProgress{
			Total:     totalTweets,
			Completed: 0,
			Failed:    totalTweets,
		})
	}

	var completed atomic.Int64
	var remaining atomic.Int64
	remaining.Store(int64(totalTweets))

	newFails := BatchDownloadTweet(ctx, client, true, dwn, fileWriter, opts, func(pt PackagedTweet, failed bool) {
		if progress == nil {
			return
		}

		completed := int(completed.Add(1))
		remainingCount := int(remaining.Load())
		if !failed {
			remainingCount = int(remaining.Add(-1))
		}

		progress(RetryProgress{
			Total:     totalTweets,
			Completed: completed,
			Failed:    remainingCount,
		})
	}, toretry...)

	// 注意：BatchDownloadTweet 内部的 downloadTweetMedia 会原地修改 tweet.Urls
	// （只保留仍需重试的 URL），toretry 内的 Tweet 与 dumper 内部是同一
	// *twitter.Tweet 指针，此处读取的 Urls 反映的是下载后的缩减结果。
	failedSet := make(map[uint64]struct{}, len(newFails))
	for _, pt := range newFails {
		if tw := pt.GetTweet(); tw != nil {
			failedSet[tw.Id] = struct{}{}
		}
	}
	return failedSet, completed.Load()
}

// classifyRetryResults updates the dumper for each retried tweet: recovered
// and non-retriable tweets are removed, tweets with remaining URLs are kept.
func classifyRetryResults(toretry []PackagedTweet, failedSet map[uint64]struct{}, rc retryClassifier) {
	for _, pt := range toretry {
		tw := pt.GetTweet()
		if tw == nil {
			continue
		}
		key, skip, skipReason := rc.resolve(pt)
		if skip {
			if skipReason != "" {
				log.Warnf("[download] Retry skipped%s tweet_id=%d %s", rc.kindLabel, tw.Id, skipReason)
			}
			continue
		}

		if _, isFailed := failedSet[tw.Id]; !isFailed {
			rc.remove(pt, key)
			log.Debugf("[download] Retry recovered%s tweet_id=%d", rc.kindLabel, tw.Id)
		} else if len(tw.Urls) > 0 {
			log.Warnf("[download] Retry remaining%s tweet_id=%d media=%d", rc.kindLabel, tw.Id, len(tw.Urls))
		} else {
			rc.remove(pt, key)
			log.Debugf("[download] Retry handled non-retriable%s tweet_id=%d", rc.kindLabel, tw.Id)
		}
	}
}
