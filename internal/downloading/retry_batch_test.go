package downloading

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/unkmonster/tmd/internal/twitter"
)

// retryUserMediaTransport 拦截 UserMedia 请求：第一次模拟可重试的网络错误，
// 之后返回空时间线，让 GetMedias 成功结束。
type retryUserMediaTransport struct {
	mu    sync.Mutex
	calls int
}

func (t *retryUserMediaTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.mu.Lock()
	t.calls++
	call := t.calls
	t.mu.Unlock()

	if call == 1 {
		return nil, errors.New("connection reset by peer")
	}

	return &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     make(http.Header),
		Body: io.NopCloser(strings.NewReader(`{
			"data": {
				"user": {
					"result": {
						"timeline_v2": {
							"timeline": {
								"instructions": []
							}
						}
					}
				}
			}
		}`)),
		Request: req,
	}, nil
}

func (t *retryUserMediaTransport) CallCount() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.calls
}

func TestBatchUserDownloadRetryMainLoop(t *testing.T) {
	oldDelay := userFetchRetryDelay
	userFetchRetryDelay = 10 * time.Millisecond
	defer func() { userFetchRetryDelay = oldDelay }()

	db := setupTestDB(t)
	defer db.Close()

	tr := &retryUserMediaTransport{}
	client := resty.New()
	client.SetTransport(tr)

	users := []userInListEntity{
		{
			user: &twitter.User{
				Id:          1,
				Name:        "Test User",
				ScreenName:  "testuser",
				MediaCount:  10,
				IsProtected: false,
			},
		},
	}

	var completed atomic.Int32
	fails, summary, err := BatchUserDownload(
		context.Background(),
		client,
		db,
		users,
		t.TempDir(),
		false,
		nil,
		nil,
		nil,
		RuntimeOptions{MaxDownloadRoutine: 1, MaxUserFetchConcurrent: 1},
		func(p BatchProgress) { completed.Store(int32(p.Completed)) },
	)
	if err != nil {
		t.Fatalf("BatchUserDownload() error = %v", err)
	}
	if len(fails) != 0 {
		t.Fatalf("BatchUserDownload() fails = %d, want 0", len(fails))
	}
	if summary.TotalEntities != 1 {
		t.Fatalf("summary.TotalEntities = %d, want 1", summary.TotalEntities)
	}
	if got := tr.CallCount(); got != 2 {
		t.Fatalf("UserMedia requests = %d, want 2 (one retryable failure + one success)", got)
	}
	if completed.Load() != 1 {
		t.Fatalf("progress completed = %d, want 1", completed.Load())
	}
}
