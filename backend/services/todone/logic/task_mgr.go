package logic

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/multi"
	"github.com/intmian/platform/backend/services/todone/db"
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

func (t *TaskMgr) CreateRootTaskLogic(userID string, parentSubGroupID uint32, note string, index float32) error {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	id, err := db.CreateTask(connect, userID, parentSubGroupID, 0, note, index)
	if err != nil {
		return errors.Join(err, ErrCreateTaskFailed)
	}
	taskLogic := NewTaskLogic(id)
	taskLogic.OnBindOutData(&db.TaskDB{
		UserID:           userID,
		TaskID:           id,
		Note:             note,
		ParentSubGroupID: parentSubGroupID,
		ParentTaskID:     0,
		Index:            index,
		Deleted:          false,
		Done:             false,
	})
	t.dataMap.Store(id, taskLogic)
	return nil
}

func (t *TaskMgr) CreateSubTaskLogic(userID string, parentTaskID uint32, note string) error {
	// 校验父任务是否存在
	task := t.GetTaskLogic(parentTaskID)
	if task == nil {
		return ErrParentTaskNotExist
	}
	index := task.GeneSubTaskIndex()

	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	id, err := db.CreateTask(connect, userID, 0, parentTaskID, note, index)
	if err != nil {
		return errors.Join(err, ErrCreateSubTaskFailed)
	}
	taskLogic := NewTaskLogic(id)
	taskLogic.OnBindOutData(&db.TaskDB{
		UserID:           userID,
		TaskID:           id,
		Note:             note,
		ParentSubGroupID: 0,
		ParentTaskID:     parentTaskID,
		Index:            index,
		Deleted:          false,
		Done:             false,
	})
	t.dataMap.Store(id, taskLogic)
	return nil
}

func (t *TaskMgr) RemoveTaskLogic(taskID uint32) error {
	if logic, ok := t.dataMap.Load(taskID); ok {
		err := logic.Delete()
		if err != nil {
			return errors.Join(err, ErrDeleteTaskLogicFailed)
		}
		t.dataMap.Delete(taskID)
	}
	return nil
}
