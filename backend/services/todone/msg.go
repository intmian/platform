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
}

type MoveDirRet struct {
	Suc bool
}

const MoveGroup share.Cmd = "moveGroup"

type MoveGroupReq struct {
	UserID  string
	GroupID uint32
	TrgDir  uint32 // 放在哪个目录下
}

type MoveGroupRet struct {
	Suc bool
}

const MoveDirGroupAfterOther share.Cmd = "moveDirGroupAfterOther"

type MoveDirGroupAfterOtherReq struct {
	UserID      string
	IsDir       bool
	Id          uint32
	IsTargetDir bool
	TargetId    uint32 // 为0表示放在最前面
}

type MoveDirGroupAfterOtherRet struct {
	Suc bool
}

const CmdCreateDir share.Cmd = "createDir"

type CreateDirReq struct {
	UserID      string
	ParentDirID uint32
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
	Suc bool
}

const CmdDelGroup share.Cmd = "delGroup"

type DelGroupReq struct {
	UserID  string
	GroupID uint32
}

type DelGroupRet struct {
	Suc bool
}
