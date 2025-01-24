package logic

import (
	"github.com/intmian/mian_go_lib/tool/multi"
)

type TaskMgr struct {
	dataMap multi.SafeMap[uint32, *TaskLogic]
}

func NewTaskMgr() *TaskMgr {
	return &TaskMgr{}
}

func (t *TaskMgr) GetTaskLogic(taskID uint32) *TaskLogic {
	if logic, ok := t.dataMap.Load(taskID); ok {
		return logic
	}

	logic := NewTaskLogic(taskID)
	t.dataMap.Store(taskID, logic)
	return logic
}
