package logic

import "github.com/intmian/mian_go_lib/tool/multi"

type UserMgr struct {
	userMap multi.SafeMap[string, *UserLogic]
}

func (u *UserMgr) GetUserLogic(userID string) *UserLogic {
	if v, ok := u.userMap.Load(userID); ok {
		return v
	}
	logic := NewUserLogic()
	u.userMap.Store(userID, logic)
	return logic
}
