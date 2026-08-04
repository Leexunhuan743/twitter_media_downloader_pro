package main

import (
	"os"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestShutdownSignals(t *testing.T) {
	assert.Equal(t, []os.Signal{os.Interrupt, syscall.SIGTERM}, shutdownSignals())
}

func TestShutdownSignalSubscriptionHandlesFirstSignal(t *testing.T) {
	subscription := &shutdownSignalSubscription{signals: make(chan os.Signal, 1)}
	handled := make(chan os.Signal, 1)
	go subscription.listen(func(sig os.Signal) {
		handled <- sig
	})

	subscription.signals <- os.Interrupt
	select {
	case sig := <-handled:
		assert.Equal(t, os.Interrupt, sig)
	case <-time.After(time.Second):
		t.Fatal("shutdown signal was not handled")
	}
	assert.False(t, subscription.stop())
}

func TestShutdownSignalSubscriptionStopPreventsCallback(t *testing.T) {
	subscription := &shutdownSignalSubscription{signals: make(chan os.Signal, 1)}
	assert.True(t, subscription.stop())

	called := false
	subscription.listen(func(os.Signal) {
		called = true
	})
	assert.False(t, called)
	assert.False(t, subscription.stop())
}
