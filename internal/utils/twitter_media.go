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

// twimgFormatExt returns the extension advertised by the "format" query
// parameter that modern pbs URLs use instead of a path extension
// ("/media/xyz?format=png&name=large"). Only lowercase alphanumeric values of a
// plausible extension length are accepted, so an unexpected value leaves the
// caller's default in place instead of inventing a suffix. Non-twimg hosts are
// ignored: "format" only carries this meaning on Twitter's media CDN.
func twimgFormatExt(u string) string {
	pu, err := url.Parse(u)
	if err != nil || !isTwitterMediaHost(pu.Hostname()) {
		return ""
	}
	format := strings.ToLower(pu.Query().Get("format"))
	if format == "" || len(format) > 5 {
		return ""
	}
	for i := 0; i < len(format); i++ {
		c := format[i]
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return ""
		}
	}
	return "." + format
}
