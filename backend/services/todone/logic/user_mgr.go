package logic

import (
	"sync"

	"github.com/intmian/mian_go_lib/tool/multi"
)

type UserMgr struct {
	userMap multi.SafeMap[string, *UserLogic]
	// 只保护“第一次创建”：同一用户的两个首次请求同时进来时，不能各建一个 UserLogic（各自的锁和缓存会互相覆盖）
	createLock sync.Mutex
}

func (u *UserMgr) GetUserLogic(userID string) *UserLogic {
	if v, ok := u.userMap.Load(userID); ok {
		return v
	}
	u.createLock.Lock()
	defer u.createLock.Unlock()
	if v, ok := u.userMap.Load(userID); ok {
		return v
	}
	logic := NewUserLogic(userID)
	u.userMap.Store(userID, logic)
	return logic
}

func (u *UserMgr) SafeUseUserLogic(userID string, f func(logic *UserLogic), notFound func()) {
	//start := time.Now()
	user := u.GetUserLogic(userID)
	if user == nil {
		notFound()
		return
	}
	user.Lock()
	//lockedTime := time.Now()
	defer user.Unlock()
	f(user)
	//end := time.Now()
	//println("SafeUseUserLogic", userID, "locked time:", lockedTime.Sub(start).Seconds(), "function time:", end.Sub(lockedTime).Seconds())
}
