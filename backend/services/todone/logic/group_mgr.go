package logic

import "github.com/intmian/mian_go_lib/tool/multi"

type GroupMgr struct {
	groupMap multi.SafeMap[uint32, *GroupLogic]
}

func (g *GroupMgr) GetGroupLogic(groupID uint32) *GroupLogic {
	if v, ok := g.groupMap.Load(groupID); ok {
		return v
	}
	return nil
}
