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

const MoveDir share.Cmd = "moveDir"

type MoveDirReq struct {
	UserID string
	DirID  uint32
	TrgDir uint32 // 放在哪个目录下

	AfterID    uint32
	AfterIsDir bool
}

type MoveDirRet struct {
}

const MoveGroup share.Cmd = "moveGroup"

type MoveGroupReq struct {
	UserID  string
	GroupID uint32
	TrgDir  uint32 // 放在哪个目录下

	AfterID    uint32
	AfterIsDir bool
}

type MoveGroupRet struct {
}

type MoveDirGroupAfterOtherRet struct {
}

const CmdCreateDir share.Cmd = "createDir"

type CreateDirReq struct {
	UserID      string
	ParentDirID uint32
	AfterID     uint32
	AfterIsDir  bool
	Title       string
	Note        string
}

type CreateDirRet struct {
	DirID uint32
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
	UserID  string
	GroupID uint32
}

type DelGroupRet struct {
}

const CmdCreateGroup share.Cmd = "createGroup"

type CreateGroupReq struct {
	UserID     string
	Title      string
	Note       string
	ParentDir  uint32
	AfterID    uint32
	AfterIsDir bool
}

type CreateGroupRet struct {
	GroupID uint32
	Index   float32
}

const CmdChangeGroup share.Cmd = "changeGroup"

type ChangeGroupReq struct {
	UserID string
	Group  protocol.PGroup
	Title  string
	Note   string
}

type ChangeGroupRet struct {
}

const CmdGetSubGroup share.Cmd = "getSubGroup"

type GetSubGroupReq struct {
	UserID  string
	GroupID uint32
}

type GetSubGroupRet struct {
	SubGroups []protocol.PSubGroup
}

const CmdGetTaskByPage share.Cmd = "getTaskByPage"

type GetTaskByPageReq struct {
	UserID     string
	GroupID    uint32
	SubGroupID uint32
	Page       int
	PageNum    int
}

type DelSubGroupReq struct {
	UserID     string
	GroupID    uint32
	SubGroupID uint32
}

type DelSubGroupRet struct {
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
	TaskID uint32
	Title  string
	Note   string
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
	GroupID    uint32
	SubGroupID uint32
	ParentTask uint32
	Title      string
	Note       string
	AfterID    uint32
}

type CreateTaskRet struct {
	TaskID uint32
}

const CmdDelTask share.Cmd = "delTask"

type DelTaskReq struct {
	UserID string
	TaskID uint32
}

type DelTaskRet struct {
}
