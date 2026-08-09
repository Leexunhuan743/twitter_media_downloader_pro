package utils

import (
	"net/url"
	"strings"
)

const twitterImageQuality4096 = "4096x4096"
const twitterImageQualityOrig = "orig"

func isHighestTwitterImageQuality(name string) bool {
	return name == twitterImageQualityOrig || name == twitterImageQuality4096
}

func isTwitterMediaHost(host string) bool {
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	return host == "twimg.com" || strings.HasSuffix(host, ".twimg.com")
}

func isTwitterVideoMediaURL(parsed *url.URL) bool {
	return strings.EqualFold(parsed.Hostname(), "video.twimg.com") || strings.Contains(parsed.Path, "tweet_video")
}
