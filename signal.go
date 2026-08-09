package main

import (
	"os"
	"os/signal"
	"sync"
)

type shutdownSignalSubscription struct {
	signals  chan os.Signal
	done     chan struct{}
	stopOnce sync.Once
}

func notifyOnShutdownSignal(handler func(os.Signal)) func() {
	subscription := newShutdownSignalSubscription()
	signal.Notify(subscription.signals, shutdownSignals()...)
	go subscription.listen(handler)

	return subscription.stop
}

func newShutdownSignalSubscription() *shutdownSignalSubscription {
	return &shutdownSignalSubscription{
		signals: make(chan os.Signal, 1),
		done:    make(chan struct{}),
	}
}

func (s *shutdownSignalSubscription) listen(handler func(os.Signal)) {
	defer close(s.done)

	sig, ok := <-s.signals
	if !ok || !s.unsubscribe() {
		return
	}
	if handler != nil {
		handler(sig)
	}
}

func (s *shutdownSignalSubscription) stop() {
	s.unsubscribe()
	// Do not let callers release resources while the shutdown callback is still using them.
	// The callback itself must not call stop, because it cannot wait for its own return.
	<-s.done
}

// unsubscribe returns true only to the caller that claims signal handling.
func (s *shutdownSignalSubscription) unsubscribe() bool {
	unsubscribed := false
	s.stopOnce.Do(func() {
		signal.Stop(s.signals)
		close(s.signals)
		unsubscribed = true
	})
	return unsubscribed
}
