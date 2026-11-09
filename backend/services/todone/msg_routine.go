package todone

import (
	"github.com/intmian/platform/backend/services/todone/protocol"
	"github.com/intmian/platform/backend/share"
)

const (
	CmdGetRoutine  share.Cmd = "getRoutine"
	CmdSaveRoutine share.Cmd = "saveRoutine"
)

type GetRoutineReq struct {
	UserID  string
	DirID   uint32
	GroupID uint32
}

type GetRoutineRet struct {
	Nodes []protocol.PRoutineNode
}

type RoutineDelTasks struct {
	SubGroupID uint32
	TaskIDs    []uint32
}

// SaveRoutineReq 在同一把用户锁内批量删除临时任务并写入节点状态。
type SaveRoutineReq struct {
	UserID   string
	DirID    uint32
	GroupID  uint32
	Nodes    []protocol.PRoutineNode
	DelTasks []RoutineDelTasks
}

type SaveRoutineRet struct{}
