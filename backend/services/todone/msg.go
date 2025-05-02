package todone

import (
	"github.com/intmian/platform/backend/services/todone/protocol"
	"github.com/intmian/platform/backend/share"
)

const CmdGetDirTree share.Cmd = "getDirTree"

type GetDirTreeReq struct {
	UserID string
}

type GetDirTreeRet struct {
	DirTree protocol.PDirTree
}

const CmdMoveDir share.Cmd = "moveDir"

type MoveDirReq struct {
	UserID string
	DirID  uint32
	TrgDir uint32 // 放在哪个目录下

	AfterID uint32
}

type MoveDirRet struct {
	Index float32
}

const CmdMoveGroup share.Cmd = "moveGroup"

type MoveGroupReq struct {
	UserID      string
	GroupID     uint32
	ParentDirID uint32
	TrgDir      uint32 // 放在哪个目录下

	AfterID uint32
}

type MoveGroupRet struct {
	Index float32
}

const CmdCreateDir share.Cmd = "createDir"

type CreateDirReq struct {
	UserID      string
	ParentDirID uint32
	AfterID     uint32
	Title       string
	Note        string
}

type CreateDirRet struct {
	DirID uint32
	Index float32
}

const CmdChangeDir share.Cmd = "changeDir"

type ChangeDirReq struct {
	UserID string
	DirID  uint32
	Title  string
	Note   string
}

type ChangeDirRet struct {
}

const CmdDelDir share.Cmd = "delDir"

type DelDirReq struct {
	UserID string
	DirID  uint32
}

type DelDirRet struct {
}

const CmdDelGroup share.Cmd = "delGroup"

type DelGroupReq struct {
	UserID    string
	ParentDir uint32
	GroupID   uint32
}

type DelGroupRet struct {
}

const CmdCreateGroup share.Cmd = "createGroup"

type CreateGroupReq struct {
	UserID    string
	Title     string
	Note      string
	ParentDir uint32
	AfterID   uint32
}

type CreateGroupRet struct {
	GroupID uint32
	Index   float32
}

const CmdChangeGroup share.Cmd = "changeGroup"

type ChangeGroupReq struct {
	UserID      string
	ParentDirID uint32
	GroupID     uint32
	Title       string
	Note        string
}

type ChangeGroupRet struct {
}

const CmdGetSubGroup share.Cmd = "getSubGroup"

type GetSubGroupReq struct {
	UserID      string
	ParentDirID uint32
	GroupID     uint32
}

type GetSubGroupRet struct {
	SubGroups []protocol.PSubGroup
}

const CmdGetTaskByPage share.Cmd = "getTaskByPage"

type GetTaskByPageReq struct {
	UserID      string
	ParentDirID uint32
	GroupID     uint32
	SubGroupID  uint32
	Page        int
	PageNum     int
	ContainDone bool
}

type GetTaskByPageRet struct {
	Tasks []protocol.PTask
}

const CmdGetTask share.Cmd = "getTask"

type GetTaskReq struct {
	UserID string
	TaskID uint32
}

type GetTaskRet struct {
	Task protocol.PTask
}

const CmdChangeTask share.Cmd = "changeTask"

type ChangeTaskReq struct {
	UserID string
	Data   protocol.PTask
}

type ChangeTaskRet struct {
}

type ChangeDoneTaskReq struct {
	UserID string
	TaskID uint32
	Done   bool
}

type ChangeDoneTaskRet struct {
}

const CmdCreateTask share.Cmd = "createTask"

type CreateTaskReq struct {
	UserID     string
	DirID      uint32
	GroupID    uint32
	SubGroupID uint32
	ParentTask uint32
	Title      string
	Note       string
	AfterID    uint32
	Started    bool
	TaskType   int
}

type CreateTaskRet struct {
	Task protocol.PTask
}

const CmdDelTask share.Cmd = "delTask"

type DelTaskReq struct {
	UserID string
	TaskID uint32
}

type DelTaskRet struct {
}

const CmdCreateSubGroup share.Cmd = "createSubGroup"

type CreateSubGroupReq struct {
	UserID      string
	ParentDirID uint32
	GroupID     uint32
	Title       string
	Note        string
	AfterID     uint32
}

type CreateSubGroupRet struct {
	SubGroupID uint32
	Index      float32
}

const CmdDelSubGroup share.Cmd = "delSubGroup"

type DelSubGroupReq struct {
	UserID      string
	ParentDirID uint32
	GroupID     uint32
	SubGroupID  uint32
}

type DelSubGroupRet struct {
}

const CmdGetTasks share.Cmd = "getTasks"

type GetTasksReq struct {
	UserID      string
	ParentDirID uint32
	GroupID     uint32
	SubGroupID  uint32
	ContainDone bool
}

type GetTasksRet struct {
	Tasks []protocol.PTask
}
