package logic

import "github.com/intmian/mian_go_lib/tool/multi"

type UserMgr struct {
	userMap multi.SafeMap[string, *UserLogic]
}

func (u *UserMgr) GetUserLogic(userID string) *UserLogic {
	if v, ok := u.userMap.Load(userID); ok {
		return v
	}
	logic := NewUserLogic(userID)
	u.userMap.Store(userID, logic)
	return logic
}

func (u *UserMgr) SafeUseUserLogic(userID string, f func(logic *UserLogic), notFound func()) {
	user := u.GetUserLogic(userID)
	if user == nil {
		notFound()
		return
	}
	user.Lock()
	defer user.Unlock()
	f(user)
}
