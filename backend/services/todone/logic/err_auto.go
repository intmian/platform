package logic

type ErrStr string

const (
	ErrNil                   = ErrStr("nil")
	ErrGetTaskDataFailed     = ErrStr("get task data failed")     // auto generated from .\task.go
	ErrGetTagsFailed         = ErrStr("get tags failed")          // auto generated from .\task.go
	ErrTagAlreadyExists      = ErrStr("tag already exists")       // auto generated from .\task.go
	ErrCreateTaskFailed      = ErrStr("create task failed")       // auto generated from .\task_mgr.go
	ErrParentTaskNotExist    = ErrStr("parent task not exist")    // auto generated from .\task_mgr.go
	ErrCreateSubTaskFailed   = ErrStr("create sub task failed")   // auto generated from .\task_mgr.go
	ErrDeleteTaskLogicFailed = ErrStr("delete task logic failed") // auto generated from .\task_mgr.go
)

func (e ErrStr) Error() string { return string(e) }
