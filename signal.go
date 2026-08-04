package main

import (
	"os"
	"os/signal"
	"sync"
)

type shutdownSignalSubscription struct {
	signals  chan os.Signal
	stopOnce sync.Once
}

func notifyOnShutdownSignal(handler func(os.Signal)) func() {
	subscription := &shutdownSignalSubscription{
		signals: make(chan os.Signal, 1),
	}
	signal.Notify(subscription.signals, shutdownSignals()...)
	go subscription.listen(handler)

	return func() {
		subscription.stop()
	}
}

func (s *shutdownSignalSubscription) listen(handler func(os.Signal)) {
	sig, ok := <-s.signals
	if !ok || !s.stop() {
		return
	}
	if handler != nil {
		handler(sig)
	}
}

// stop returns true only to the caller that wins the subscription lifecycle.
func (s *shutdownSignalSubscription) stop() bool {
	stopped := false
	s.stopOnce.Do(func() {
		signal.Stop(s.signals)
		close(s.signals)
		stopped = true
	})
	return stopped
}
