package utils

import (
	"sync"
)

type Heap[T any] struct {
	data []T
	less func(T, T) bool
	mtx  sync.RWMutex
}

func NewHeap[T any](less func(T, T) bool) *Heap[T] {
	if less == nil {
		panic("heap comparator is nil")
	}
	return &Heap[T]{less: less, data: []T{}}
}

func (hp *Heap[T]) Push(val T) {
	hp.mtx.Lock()
	defer hp.mtx.Unlock()

	hp.data = append(hp.data, val)
	hp.siftUp(len(hp.data) - 1)
}

func (hp *Heap[T]) Pop() T {
	top, ok := hp.TryPop()
	if !ok {
		panic("heap is empty")
	}
	return top
}

// TryPop removes the top value and reports whether the heap was non-empty.
func (hp *Heap[T]) TryPop() (T, bool) {
	hp.mtx.Lock()
	defer hp.mtx.Unlock()

	n := len(hp.data)
	if n == 0 {
		var zero T
		return zero, false
	}

	top := hp.data[0]
	hp.swap(0, n-1)
	var zero T
	hp.data[n-1] = zero
	hp.data = hp.data[:n-1]
	if len(hp.data) > 0 {
		hp.siftDown(0)
	}
	return top, true
}

func (hp *Heap[T]) Peek() T {
	top, ok := hp.TryPeek()
	if !ok {
		panic("heap is empty")
	}
	return top
}

// TryPeek returns the top value without removing it and reports whether it exists.
func (hp *Heap[T]) TryPeek() (T, bool) {
	hp.mtx.RLock()
	defer hp.mtx.RUnlock()

	if len(hp.data) == 0 {
		var zero T
		return zero, false
	}
	return hp.data[0], true
}

func (hp *Heap[T]) Size() int {
	hp.mtx.RLock()
	defer hp.mtx.RUnlock()

	return len(hp.data)
}

func (hp *Heap[T]) Empty() bool {
	hp.mtx.RLock()
	defer hp.mtx.RUnlock()

	return len(hp.data) == 0
}

func (hp *Heap[T]) left(i int) int {
	return 2*i + 1
}

func (hp *Heap[T]) right(i int) int {
	return 2*i + 2
}

func (hp *Heap[T]) parent(i int) int {
	return (i - 1) / 2
}

func (hp *Heap[T]) swap(i int, j int) {
	hp.data[i], hp.data[j] = hp.data[j], hp.data[i]
}

func (hp *Heap[T]) siftUp(i int) {
	for i > 0 {
		p := hp.parent(i)
		if !hp.less(hp.data[i], hp.data[p]) {
			break
		}

		hp.swap(i, p)
		i = p
	}
}

func (hp *Heap[T]) siftDown(i int) {
	for {
		min := i
		left, right := hp.left(i), hp.right(i)
		if left < len(hp.data) && hp.less(hp.data[left], hp.data[min]) {
			min = left
		}
		if right < len(hp.data) && hp.less(hp.data[right], hp.data[min]) {
			min = right
		}

		if min == i {
			break
		}
		hp.swap(min, i)
		i = min
	}
}
