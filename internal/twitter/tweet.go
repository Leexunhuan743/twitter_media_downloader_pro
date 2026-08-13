package twitter

import (
	"fmt"
	"html"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/tidwall/gjson"
)

type Tweet struct {
	Id        uint64
	Text      string
	CreatedAt time.Time
	Creator   *User
	Urls      []string
	RawJSON   string
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
		tweet.Urls = getUrlsFromMedia(&media)
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

func getUrlsFromMedia(media *gjson.Result) []string {
	results := []string{}
	for _, m := range media.Array() {
		switch m.Get("type").String() {
		case "video", "animated_gif":
			results = append(results, bestVideoVariantURL(m.Get("video_info.variants")))
		case "photo":
			results = append(results, m.Get("media_url_https").String())
		}
	}
	return results
}

// bestVideoVariantURL selects the URL of the highest-bitrate video variant,
// mirroring the explicit max-bitrate pick used for formatted entries
// (json_folder_download parseFormattedEntry): playlist variants without a
// bitrate are never preferred. Falls back to the last variant when none
// declares a bitrate, which reproduces the legacy @reverse.0 selection.
func bestVideoVariantURL(variants gjson.Result) string {
	var bestURL string
	var maxBitrate int64
	var lastURL string
	for _, v := range variants.Array() {
		url := v.Get("url").String()
		if url == "" {
			continue
		}
		lastURL = url
		bitrate := v.Get("bitrate").Int()
		if bitrate > maxBitrate {
			maxBitrate = bitrate
			bestURL = url
		}
	}
	if bestURL == "" {
		return lastURL
	}
	return bestURL
}
