package cmd

import (
	"github.com/intmian/platform/backend/services/cmd/run"
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

// 创建空环境
const CmdCreateEnv share.Cmd = "createEnv"

type CreateEnvReq struct {
}

type CreateEnvRet struct {
	Suc   bool
	EnvID uint32
}

// 查看所有环境
const CmdGetEnvs share.Cmd = "getEnvs"

type GetEnvsReq struct {
}

type GetEnvsRet struct {
	EnvData []run.EnvData
}

// 查看环境
const CmdGetEnv share.Cmd = "getEnv"

type GetEnvReq struct {
	EnvID uint32
}

type GetEnvRet struct {
	EnvData  run.EnvData
	AllFiles []string
}

// 查看文件内容
const CmdGetFile share.Cmd = "getFile"

type GetFileReq struct {
	EnvID    uint32
	FileName string
}

type GetFileRet struct {
	Content string
}

// 修改文件内容
const CmdSetFile share.Cmd = "setFile"

type SetFileReq struct {
	EnvID    uint32
	FileName string
	Content  string
}

type SetFileRet struct {
}

// 修改环境参数
const CmdSetEnv share.Cmd = "setEnv"

type SetEnvReq struct {
	EnvID      uint32
	params     []string
	note       string
	bindToolID string
}

type SetEnvRet struct {
}

// 运行环境
const CmdRunEnv share.Cmd = "runEnv"

type RunEnvReq struct {
	EnvID  uint32
	ToolID string
	Params []string
}

type RunEnvRet struct {
}

// 查看所有任务ID
const CmdGetTasks share.Cmd = "getTasks"

type GetTasksReq struct {
	EvnID uint32
}

type GetTasksRet struct {
	TaskData []struct {
		TaskIndex int
		Status    run.TaskStatus
	}
}

// 查看任务详情
const CmdGetTask share.Cmd = "getTask"

type GetTaskReq struct {
	EnvID     uint32
	TaskIndex int
	LastIndex int
}

type GetTaskRet struct {
	IOs    []run.TaskIO
	Status run.TaskStatus
}

// 停止任务
const CmdStopTask share.Cmd = "stopTask"

type StopTaskReq struct {
	EvnID     uint32
	TaskIndex int
}

type StopTaskRet struct {
}

// 对任务进行输入
const CmdTaskInput share.Cmd = "taskInput"

type TaskInputReq struct {
	EvnID     uint32
	TaskIndex int
	Content   string
}

type TaskInputRet struct {
}
