package twitter

import (
	"fmt"
	"html"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/tidwall/gjson"
)

type Tweet struct {
	Id         uint64
	Text       string
	CreatedAt  time.Time
	Creator    *User
	Urls       []string
	LegacyURLs []string `json:"legacy_urls,omitempty"`
	RawJSON    string
}

func parseTweetResults(tweet_results *gjson.Result) (*Tweet, error) {
	var tweet Tweet
	var err error

	result := tweet_results.Get("result")
	if !result.Exists() || result.Get("__typename").String() == "TweetTombstone" {
		return nil, nil
	}
	if result.Get("__typename").String() == "TweetWithVisibilityResults" {
		result = result.Get("tweet")
	}
	legacy := result.Get("legacy")
	if !legacy.Exists() {
		return nil, nil
	}
	user_results := result.Get("core.user_results")

	tweet.Id = result.Get("rest_id").Uint()
	tweet.RawJSON = result.Raw

	tweet.Text = TweetTextFromResult(&result)

	tweet.Creator, _, err = parseUserResults(&user_results)
	if err != nil {
		log.Debugf("[twitter] Tweet creator parse failed tweet_id=%d error=%q", tweet.Id, errorForLog(err))
	}
	tweet.CreatedAt, err = TweetCreatedAtFromResult(&result)
	if err != nil {
		return nil, fmt.Errorf("invalid time format %v", err)
	}
	media := legacy.Get("extended_entities.media")
	if media.Exists() {
		tweet.Urls, tweet.LegacyURLs = getUrlsFromMedia(&media)
	}
	return &tweet, nil
}

// TweetTextFromResult extracts the tweet display text, preferring the long-form
// note-tweet body and falling back to legacy.full_text, unescaping HTML entities.
func TweetTextFromResult(result *gjson.Result) string {
	noteTweet := result.Get("note_tweet.note_tweet_results.result.text")
	if noteTweet.Exists() && noteTweet.String() != "" {
		return html.UnescapeString(noteTweet.String())
	}
	return html.UnescapeString(result.Get("legacy.full_text").String())
}

// TweetCreatedAtFromResult parses the tweet creation time from legacy.created_at
// (RubyDate format). The zero time is returned when the field is absent or
// malformed; callers that require the timestamp propagate the error themselves.
func TweetCreatedAtFromResult(result *gjson.Result) (time.Time, error) {
	return time.Parse(time.RubyDate, result.Get("legacy.created_at").String())
}

func getUrlsFromMedia(media *gjson.Result) (urls []string, legacyURLs []string) {
	for _, m := range media.Array() {
		switch m.Get("type").String() {
		case "video", "animated_gif":
			url, legacyURL := videoVariantURLs(m.Get("video_info.variants"))
			urls = append(urls, url)
			legacyURLs = append(legacyURLs, legacyURL)
		case "photo":
			url := m.Get("media_url_https").String()
			urls = append(urls, url)
			legacyURLs = append(legacyURLs, url)
		}
	}
	return urls, legacyURLs
}

// VideoVariant is the minimal source-independent representation used to make
// video selection identical for GraphQL tweets and saved loongtweet JSON.
type VideoVariant struct {
	URL     string
	Bitrate int64
}

// SelectVideoVariantURLs returns the preferred highest-bitrate URL and the
// exact final-array URL selected by releases before bitrate-aware selection.
// The latter is retained only to locate existing filenames during an upgrade.
func SelectVideoVariantURLs(variants []VideoVariant) (preferredURL, legacyURL string) {
	var lastUsableURL string
	var maxBitrate int64
	for _, variant := range variants {
		legacyURL = variant.URL
		if variant.URL == "" {
			continue
		}
		lastUsableURL = variant.URL
		if variant.Bitrate > maxBitrate {
			maxBitrate = variant.Bitrate
			preferredURL = variant.URL
		}
	}
	if preferredURL == "" {
		preferredURL = lastUsableURL
	}
	return preferredURL, legacyURL
}

func videoVariantURLs(variants gjson.Result) (string, string) {
	parsed := make([]VideoVariant, 0, len(variants.Array()))
	for _, variant := range variants.Array() {
		parsed = append(parsed, VideoVariant{
			URL:     variant.Get("url").String(),
			Bitrate: variant.Get("bitrate").Int(),
		})
	}
	return SelectVideoVariantURLs(parsed)
}

// bestVideoVariantURL selects the URL of the highest-bitrate video variant,
// mirroring the explicit max-bitrate pick used for formatted entries
// (json_folder_download parseFormattedEntry): playlist variants without a
// bitrate are never preferred. Falls back to the last variant when none
// declares a bitrate, which reproduces the legacy @reverse.0 selection.
func bestVideoVariantURL(variants gjson.Result) string {
	bestURL, _ := videoVariantURLs(variants)
	return bestURL
}
