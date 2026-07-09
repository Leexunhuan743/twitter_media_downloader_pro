# Download Pipeline

The core download flow orchestrates batch user/media retrieval, single-file download, and atomic write.

## Service Layer Template

`DownloadServiceImpl.executeDownloadTemplate()` is the shared orchestration method for all 11 [[architecture|service operations]]:

```
1. Create ProgressReporter
2. Create StorePath (path helper)
3. Load TweetDumper (failed tweet recorder)
4. Prepare() — resolve users/lists from input
5. Create downloader / fileWriter / versionManager
6. BatchDownloadAny() — download all tweets' media
7. Optional: FollowMembers (after list download)
8. Collect failures into dumper
9. Optional: RetryFailedTweets
10. Optional: downloadProfile
11. completeTask (report result)
```

## Batch User Download

`BatchUserDownload()` in [[download-pipeline#Batch User Download]]:

### Preprocessing
Steps performed before media fetching begins.
1. Sync user to DB + filesystem via `syncUserAndEntity()`
2. Compute missing tweet count → determine fetch depth per entity
3. Priority queue (protected+followed users first)
4. Create symlinks (List member → List directory)
5. Auto-follow protected users (if AutoFollow=true)

### Producer-Consumer
The download pipeline uses a producer-consumer pattern to parallelize fetching and writing.
- **Producer**: pop user from priority queue → twitter API timeline fetch → push tweets into `tweetChan`
- **Consumer**: N workers read from `tweetChan` → `downloadTweetMedia()` → `fileWriter.Write()`
- Producer concurrency: ants.Pool (max 35)
- Consumer concurrency: MaxDownloadRoutine (default CPU*10, max 100)
- Per-round limit: 1500 tweets worth of API requests (userTweetRateLimit)

## Tweet Download

`tweetDownloader` worker processes each tweet:

1. Classify each URL (photo/video/gif)
2. Call `downloader.Download()` (see [[architecture|single-file download]])
3. On success: remove URL from tweet.Urls (in-place mutation)
4. On failure: keep URL, retry later (skip 403/404 — permanent)
5. Fire-and-forget: save `.loongtweet/{TweetId}.txt` + `.json`

**Key behavior**: `downloadTweetMedia` mutates `tweet.Urls` in place — callers check `len(tweet.Urls)` for complete success.

## Single-File Download

`DefaultDownloader` in `internal/downloader/`:

| File size | Strategy |
|-----------|----------|
| ≤ 10 MB | Buffer mode — GET into memory → fileWriter.Write |
| > 10 MB | Stream mode — streaming response, supports retry (max 2) |

- Uses separate `downloadClient` (no Twitter auth)
- 403/404 = permanent failure, no retry
- Stream mode size mismatch → delete incomplete file + retry

## FileWriter (Atomic Write)

`DefaultFileWriter.Write()`:
1. Create temp file in target dir (`CreateTemp(dir, ".tmp_*")`)
2. Write data (from []byte or io.Reader)
3. `os.Rename` atomic overwrite

Optional: `SkipUnchanged` (size+MD5), `CreateVersion` (`.versions/` backup), `SetModTime`

Thread safety: 256-slot hash-based mutex (same path serialized, different paths independent)

## Retry

`RetryFailedTweets()` loads failures from [[database|TweetDumper]] (persisted to `errors.json`) and re-downloads. Successes are removed from dumper; permanent failures remain for next retry cycle.
