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

The template also emits task-level [[logging#Download Logs]] for start, prepare completion, media batch completion, retry outcome, profile outcome, and final duration.

## Batch User Download

`BatchUserDownload()` orchestrates the full batch flow:

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
- List member collection: at most `listCollectMaxConcurrent` (3) concurrent lists
- Producer concurrency: ants.Pool (max min(MaxUserFetchConcurrent, entity count))
- Consumer concurrency: MaxDownloadRoutine (default CPU*10, max 50)
- Per-round limit: 1500 tweets worth of API requests (userTweetRateLimit)
- User timeline fetch retry: retryable errors (429/5xx/network) are retried up to `maxUserFetchRetries` (2) times after `userFetchRetryDelay` (60s) instead of dropping the user immediately
- `userFetchRetryDelay` is a package variable (not a const) so the end-to-end retry test can temporarily shorten the 60s wait. `TestBatchUserDownloadRetryMainLoop` drives the real producer/retry loop: the first UserMedia request fails with a retryable network error, the retry round re-queues the user, and the second request succeeds.

Batch logs summarize collect/preprocess/complete counts. They avoid per-media success logs; single tweet completion is one compact event with succeeded/failed/skipped counts.

## Tweet Download

`tweetDownloader` worker processes each tweet:

1. Classify each URL (photo/video/gif)
2. Call `downloader.Download()` (see [[architecture|single-file download]])
3. On success: remove URL from tweet.Urls (in-place mutation)
4. On failure: keep URL, retry later (skip 403/404 — permanent)
5. Fire-and-forget: save `.loongtweet/{TweetId}.txt` + `.json`

**Key behavior**: `downloadTweetMedia` mutates `tweet.Urls` in place — callers check `len(tweet.Urls)` for complete success, and the surviving URLs are exactly the ones a later retry must re-attempt.

Tweet field extraction is shared: [[internal/twitter/tweet.go#TweetTextFromResult]] selects the display text (note-tweet body preferred over `legacy.full_text`, HTML-unescaped) and [[internal/twitter/tweet.go#TweetCreatedAtFromResult]] parses `legacy.created_at`; both `parseTweetResults` and the `.loongtweet/.txt` writer use them. The txt writer deliberately tolerates a malformed timestamp (zero time, file still written) where `parseTweetResults` hard-fails — a metadata file must not be dropped over a bad date.

Video variant selection is unified: [[internal/twitter/tweet.go#SelectVideoVariantURLs]] picks the highest-bitrate variant for both the GraphQL path and formatted-entry parsing (`json_folder_download`), never preferring bitrate-less playlists, and falls back to the last usable variant when none declares a bitrate.

### Media extension selection

Every media name is derived from its URL by one rule, and nothing looks for files written by an earlier rule.

`downloadTweetMedia` derives the extension with [[internal/utils/fs.go#MediaExtFromUrl]], which truncates it at the first colon: old exports store photo URLs as `.../xyz.jpg:large`, and `path.Ext` returns `.jpg:large`, which the name normalizer (keeping only `[alnum . - _]`) merges into the bogus `.jpglarg`, itself truncated to the 8-byte extension budget. There is no compatibility lookup: a media file is written at the name the current rule computes, so re-processing already-downloaded tweets re-downloads them and overwrites in place rather than leaving duplicates.

| URL | Extension |
|-----|-----------|
| `.../xyz.jpg:large` | `.jpg` |
| `.../xyz.png:orig` | `.png` |
| `.../xyz.png?name=4096x4096` | `.png` |
| `.../xyz?format=jpg&name=medium` | `.jpg` (from the `format` query parameter) |
| `.../xyz?name=large` (no format) | `""` → the caller falls back to `.jpg` |

The `format` fallback is [[internal/utils/twitter_media.go#twimgFormatExt]]: it applies only to twimg hosts and only to lowercase-alphanumeric values of a plausible extension length, so an unexpected value leaves the caller's `.jpg` default in place rather than inventing a suffix.

The historical-name machinery was deliberately removed: `TweetNaming.LegacyFileNames`, the per-directory collision index, the pre-hardening text sanitizers, and `twitter.Tweet.LegacyURLs` (the positional retry alias persisted as `legacy_urls`) are all gone. The cost is that a naming-policy upgrade re-downloads affected media once and orphans the old file; the benefit is one naming rule and one URL list instead of a shadow copy of each.

## Single-File Download

`DefaultDownloader` in `internal/downloader/`:

| File size | Strategy |
|-----------|----------|
| ≤ 10 MB | Buffer mode — GET into memory → fileWriter.Write |
| > 10 MB | Stream mode — streaming response, supports retry (max 2) |

- Uses separate `downloadClient` (no Twitter auth)
- 403/404 = permanent failure, no retry
- Stream mode size mismatch → delete incomplete file + retry
- URL fields in downloader logs are sanitized before emission.
- Tweet media downloads pass `tweet_id` into downloader log fields so low-level retry warnings can be traced back to the source tweet.

## FileWriter (Atomic Write)

`DefaultFileWriter.Write()`:
1. Create temp file in target dir (`CreateTemp(dir, ".tmp_*")`)
2. Write data (from []byte or io.Reader)
3. `os.Rename` atomic overwrite

Optional: `SkipUnchanged` (size+MD5), `CreateVersion` (`.versions/` backup), `SetModTime`

Thread safety: 256-slot hash-based mutex (same path serialized, different paths independent)

## Retry

`RetryFailedTweets()` loads failures from [[database|TweetDumper]] (persisted to `errors.json`) and re-downloads. Successes are removed from dumper; permanent failures remain for next retry cycle.

Regular and JSON retries (`RetryFailedTweets` / `RetryFailedJsonTweets`) share one runner ([[internal/downloading/retry.go#downloadRetryBatch]] + [[internal/downloading/retry.go#classifyRetryResults]]): the download pass, progress callback, and per-tweet recovered/remaining/non-retriable classification are single implementations parameterized by the dumper kind and its removal key. Progress semantics are unified across both kinds — `Failed` reports tweets still needing retry (failures plus in-flight), decremented as successes complete; the JSON variant previously reported only in-flight tweets, under-counting failures mid-run.

Retry logs keep start/complete summaries at info level, report remaining retryable tweets as warnings, and push per-tweet recovered messages to debug level.
