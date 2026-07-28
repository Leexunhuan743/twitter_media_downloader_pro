package twitter

import (
	"net/url"
	"strings"

	"github.com/go-resty/resty/v2"
	"github.com/unkmonster/tmd/internal/logging"
)

func clientNameForLog(client *resty.Client) string {
	if client == nil {
		return "unknown"
	}
	screenName := strings.TrimSpace(GetClientScreenName(client))
	if screenName == "" {
		return "unknown"
	}
	return "@" + strings.TrimPrefix(screenName, "@")
}

func endpointForLog(raw string) string {
	if raw == "" {
		return "unknown"
	}
	u, err := url.Parse(raw)
	if err != nil {
		return logging.SanitizeURL(raw)
	}
	if u.Host == "" {
		if u.Path == "" {
			return "unknown"
		}
		return u.Path
	}
	return u.Host + u.Path
}

func errorForLog(err error) string {
	if err == nil {
		return ""
	}
	return logging.RedactSensitiveText(err.Error())
}
