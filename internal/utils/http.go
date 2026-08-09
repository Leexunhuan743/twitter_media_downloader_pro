package utils

import (
	"errors"
	"fmt"
	"regexp"

	"github.com/go-resty/resty/v2"
)

var avatarSuffixRe = regexp.MustCompile(`_(normal|bigger|mini)(\.[^/?#]+)([?#].*)?$`)

// ErrNilHTTPResponse indicates that no HTTP response was available to inspect.
var ErrNilHTTPResponse = errors.New("HTTP response is nil")

func CheckRespStatus(resp *resty.Response) error {
	if resp == nil {
		return ErrNilHTTPResponse
	}
	if resp.StatusCode() >= 400 {
		return &HttpStatusError{Code: resp.StatusCode(), Msg: resp.String()}
	}
	return nil
}

type HttpStatusError struct {
	Code int
	Msg  string
}

func (err *HttpStatusError) Error() string {
	return fmt.Sprintf("HTTP Error: %d %s", err.Code, err.Msg)
}

func IsStatusCode(err error, code int) bool {
	var e *HttpStatusError
	if !errors.As(err, &e) {
		return false
	}
	return e.Code == code
}

func StripAvatarSuffix(url string) string {
	return avatarSuffixRe.ReplaceAllString(url, "$2$3")
}
