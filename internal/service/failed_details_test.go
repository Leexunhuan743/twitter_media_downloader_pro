package service

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/unkmonster/tmd/internal/downloading"
)

func TestJsonFailureDetails_SortsAndSummarizes(t *testing.T) {
	details := jsonFailureDetails(map[string][]downloading.JsonPackagedTweet{
		"b.json": {{}, {}},
		"a.json": {{}},
	})

	assert.Equal(t, []string{"a.json: 1 failed", "b.json: 2 failed"}, details)
	assert.Nil(t, jsonFailureDetails(nil))
	assert.Nil(t, jsonFailureDetails(map[string][]downloading.JsonPackagedTweet{}))
}

func TestJsonFailureDetails_CapsAtFifty(t *testing.T) {
	failed := make(map[string][]downloading.JsonPackagedTweet, 60)
	for i := 0; i < 60; i++ {
		failed[fmt.Sprintf("file-%02d.json", i)] = []downloading.JsonPackagedTweet{{}}
	}

	details := jsonFailureDetails(failed)
	require.Len(t, details, 50)
	assert.Equal(t, "file-00.json: 1 failed", details[0])
	assert.Equal(t, "file-49.json: 1 failed", details[len(details)-1])
}

func TestCompleteProfileTaskCarriesFailedDetails(t *testing.T) {
	impl := &downloadServiceImpl{}
	reporter := NewMockProgressReporter()

	impl.completeProfileTask("task-1", reporter, &ProfileResult{
		Downloaded:    2,
		Failed:        1,
		Versioned:     0,
		FailedDetails: []string{"@alice: rate limited"},
	})

	require.Len(t, reporter.CompleteCalls, 1)
	assert.Equal(t, []string{"@alice: rate limited"}, reporter.CompleteCalls[0].Result.FailedDetails)
}

func TestCompleteTaskCopiesFailedDetails(t *testing.T) {
	impl := &downloadServiceImpl{}
	reporter := NewMockProgressReporter()

	impl.completeTask("task-1", reporter, "done", &Result{
		Main:          &MainResult{Downloaded: 1},
		FailedDetails: []string{"detail-a", "detail-b"},
	}, "")

	require.Len(t, reporter.CompleteCalls, 1)
	assert.Equal(t, []string{"detail-a", "detail-b"}, reporter.CompleteCalls[0].Result.FailedDetails)
}

func TestCloneProfileResultCopiesDetails(t *testing.T) {
	original := &ProfileResult{Downloaded: 1, FailedDetails: []string{"x"}}
	clone := cloneProfileResult(original)

	require.NotNil(t, clone)
	assert.Equal(t, []string{"x"}, clone.FailedDetails)

	clone.FailedDetails[0] = "mutated"
	assert.Equal(t, "x", original.FailedDetails[0])
}
