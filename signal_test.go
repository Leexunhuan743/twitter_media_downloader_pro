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
	subscription := newShutdownSignalSubscription()
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
	subscription.stop()
}

func TestShutdownSignalSubscriptionStopPreventsCallback(t *testing.T) {
	subscription := newShutdownSignalSubscription()
	called := false
	go subscription.listen(func(os.Signal) {
		called = true
	})
	subscription.stop()

	assert.False(t, called)
}

func TestShutdownSignalSubscriptionStopWaitsForCallback(t *testing.T) {
	subscription := newShutdownSignalSubscription()
	started := make(chan struct{})
	release := make(chan struct{})
	go subscription.listen(func(os.Signal) {
		close(started)
		<-release
	})

	subscription.signals <- os.Interrupt
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("shutdown callback did not start")
	}

	stopped := make(chan struct{})
	go func() {
		subscription.stop()
		close(stopped)
	}()

	select {
	case <-stopped:
		t.Fatal("stop returned before the shutdown callback completed")
	case <-time.After(20 * time.Millisecond):
	}

	close(release)
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("stop did not return after the shutdown callback completed")
	}
}
