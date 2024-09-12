package cmd

import (
	"github.com/intmian/platform/backend/services/cmd/tool"
	"github.com/intmian/platform/backend/share"
)

const CmdCreateTool share.Cmd = "createTool"

type CreateToolReq struct {
	Name string
	Typ  int
}

type CreateToolRet struct {
	Suc    bool
	ToolID string
}

const CmdUpdateTool share.Cmd = "updateTool"

type UpdateToolReq struct {
	ToolID  string
	Name    string
	Content string
}

type UpdateToolRet struct {
	Suc bool
}

const CmdGetTools share.Cmd = "getToolIds"

type GetToolReq struct {
}

type GetToolRet struct {
	ID2ToolData map[string]tool.ToolData
}

const CmdGetToolScript share.Cmd = "getToolScript"

type GetToolScriptReq struct {
	ToolID string
}

type GetToolScriptRet struct {
	Script string
}
