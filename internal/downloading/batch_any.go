package downloading

import (
	"context"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/downloader"
	"github.com/unkmonster/tmd/internal/twitter"
)

type BatchProgress struct {
	Total     int
	Completed int
	Failed    int
	Current   string
}

type BatchProgressFunc func(progress BatchProgress)

type BatchDownloadSummary struct {
	TotalEntities int
}

func BatchDownloadAny(ctx context.Context, client *resty.Client, db *sqlx.DB, lists []twitter.ListBase, users []*twitter.User, dir string, realDir string, autoFollow bool, additional []*resty.Client, dwn downloader.Downloader, fileWriter downloader.FileWriter, opts RuntimeOptions, progress BatchProgressFunc, lsm *ListSyncManager) (failedTweets []*TweetInEntity, listMembers []*twitter.User, summary BatchDownloadSummary, err error) {
	start := time.Now()
	log.Debugf("[batch] Collect start users=%d lists=%d auto_follow=%t", len(users), len(lists), autoFollow)

	for _, lst := range lists {
		log.Debugf("[batch] Collect list queued list=%q", lst.Title())
	}

	log.Debug("[batch] Collect users start")
	packgedUsers := make([]userInListEntity, 0)
	listMembers = make([]*twitter.User, 0)
	wg := sync.WaitGroup{}
	mtx := sync.Mutex{}
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)

	for _, lst := range lists {
		wg.Add(1)
		go func(lst twitter.ListBase) {
			defer wg.Done()
			res, members, e := syncListAndGetMembers(ctx, client, db, lst, dir, opts.normalizedMaxFileNameLen(), lsm)
			if e != nil {
				log.Errorf("[batch] Collect list sync failed list=%q error=%q", lst.Title(), e.Error())
				cancel(e)
				return
			}
			log.Debugf("[batch] Collect list members list=%q count=%d", lst.Title(), len(res))
			mtx.Lock()
			defer mtx.Unlock()
			packgedUsers = append(packgedUsers, res...)
			listMembers = append(listMembers, members...)
		}(lst)
	}
	wg.Wait()
	if err = context.Cause(ctx); err != nil {
		return nil, nil, BatchDownloadSummary{}, err
	}

	for _, usr := range users {
		log.Debugf("[batch] Collect user queued user=@%s", usr.ScreenName)
		packgedUsers = append(packgedUsers, userInListEntity{user: usr, leid: 0})
	}

	log.Debugf("[batch] Collect users complete users=%d", len(packgedUsers))
	log.Debugf("[batch] Collect complete users=%d list_members=%d duration=%s", len(packgedUsers), len(listMembers), time.Since(start))
	failedTweets, summary, err = BatchUserDownload(ctx, client, db, packgedUsers, realDir, autoFollow, additional, dwn, fileWriter, opts, progress)
	return failedTweets, listMembers, summary, err
}
