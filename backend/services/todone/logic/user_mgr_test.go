package logic

import (
	"sync"
	"testing"
)

func TestGetUserLogicConcurrentFirstAccess(t *testing.T) {
	var m UserMgr
	const n = 64
	got := make([]*UserLogic, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			got[i] = m.GetUserLogic("u1")
		}(i)
	}
	close(start)
	wg.Wait()
	for i := 1; i < n; i++ {
		if got[i] != got[0] {
			t.Fatalf("goroutine %d got a different UserLogic", i)
		}
	}
}
