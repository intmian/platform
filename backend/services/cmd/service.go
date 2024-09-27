package cmd

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/platform/backend/services/cmd/run"
	"github.com/intmian/platform/backend/services/cmd/tool"
	backendshare "github.com/intmian/platform/backend/share"
	"path"
)

// TODO: 等文件传输上传能用了就加一个文件模块.

type Service struct {
	share   backendshare.ServiceShare
	toolMgr *tool.ToolMgr
	runMgr  *run.RunMgr
	baseDir string
}

func (s *Service) Start(share backendshare.ServiceShare) error {
	s.share = share
	s.baseDir = path.Join("services", "cmd")
	// 如果不存在文件夹则创建
	err := misc.CreateDirWhenNotExist(s.baseDir)
	if err != nil {
		return errors.Join(errors.New("create dir failed"), err)
	}
	// 建议对应的脚本文件夹和运行环境文件夹
	err = misc.CreateDirWhenNotExist(path.Join(s.baseDir, "tool"))
	if err != nil {
		return errors.Join(errors.New("create dir failed"), err)
	}
	err = misc.CreateDirWhenNotExist(path.Join(s.baseDir, "run"))
	if err != nil {
		return errors.Join(errors.New("create dir failed"), err)
	}

	toolMgr, err := tool.NewToolMgr(tool.ToolMgrInit{
		Storage:   s.share.Storage,
		ScriptDir: s.baseDir,
		Log:       s.share.Log,
	})
	if err != nil {
		return errors.Join(errors.New("new tool mgr failed"), err)
	}
	runMgr := run.NewRunMgr(run.RunMgrInit{
		Storage:  s.share.Storage,
		BaseAddr: s.baseDir,
		Log:      s.share.Log,
	})
	s.toolMgr = toolMgr
	s.runMgr = runMgr
	return nil
}

func (s *Service) Stop() error {
	//s.runMgr.Stop()
	// TODO: 需要对runmgr进行改造。
	return nil
}

func (s *Service) Handle(msg backendshare.Msg, valid backendshare.Valid) {}

func (s *Service) HandleRpc(msg backendshare.Msg, valid backendshare.Valid) (interface{}, error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return nil, errors.New("no permission")
	}
	switch msg.Cmd() {
	case CmdCreateTool:
		return backendshare.HandleRpcTool("createTool", msg, valid, s.OnCreateTool)
	case CmdUpdateTool:
		return backendshare.HandleRpcTool("updateTool", msg, valid, s.OnUpdateTool)
	case CmdGetTools:
		return backendshare.HandleRpcTool("getToolIds", msg, valid, s.OnGetTools)
	case CmdGetToolScript:
		return backendshare.HandleRpcTool("getToolScript", msg, valid, s.OnGetToolScript)
	case CmdCreateEnv:
		return backendshare.HandleRpcTool("createEnv", msg, valid, s.OnCreateEnv)
	case CmdGetEnvs:
		return backendshare.HandleRpcTool("getEnvs", msg, valid, s.OnGetEnvs)
	case CmdGetEnv:
		return backendshare.HandleRpcTool("getEnv", msg, valid, s.OnGetEnv)
	case CmdGetFile:
		return backendshare.HandleRpcTool("getFile", msg, valid, s.OnGetFile)
	case CmdSetFile:
		return backendshare.HandleRpcTool("setFile", msg, valid, s.OnSetFile)
	case CmdSetEnv:
		return backendshare.HandleRpcTool("setEnv", msg, valid, s.OnSetEnv)
	case CmdRunEnv:
		return backendshare.HandleRpcTool("runEnv", msg, valid, s.OnRunEnv)
	case CmdGetTasks:
		return backendshare.HandleRpcTool("getTasks", msg, valid, s.OnGetTasks)
	case CmdGetTask:
		return backendshare.HandleRpcTool("getTask", msg, valid, s.OnGetTask)
	case CmdStopTask:
		return backendshare.HandleRpcTool("stopTask", msg, valid, s.OnStopTask)
	case CmdTaskInput:
		return backendshare.HandleRpcTool("taskInput", msg, valid, s.OnTaskInput)
	}

	return nil, errors.New("unknown cmd")
}

func (s *Service) GetProp() backendshare.ServiceProp {
	return misc.CreateProperty(backendshare.SvrPropMicro)
}

func (s *Service) OnCreateTool(valid backendshare.Valid, req CreateToolReq) (ret CreateToolRet, err error) {
	err = s.toolMgr.CreateTool(req.Name, tool.ToolType(req.Typ), "")
	if err != nil {
		err = errors.Join(errors.New("create tool failed"), err)
		return
	}
	ret.Suc = true
	return
}

func (s *Service) OnUpdateTool(valid backendshare.Valid, req UpdateToolReq) (ret UpdateToolRet, err error) {
	Tool, err := s.toolMgr.GetTool(req.ToolID)
	if err != nil {
		err = errors.Join(errors.New("get tool failed"), err)
		return
	}
	if req.Name != "" {
		err = Tool.Rename(req.Name)
		if err != nil {
			err = errors.Join(errors.New("rename tool failed"), err)
			return
		}
	}
	if req.Content != "" {
		err = Tool.SetContent(req.Content)
		if err != nil {
			err = errors.Join(errors.New("set content failed"), err)
			return
		}
	}
	ret.Suc = true
	return
}

func (s *Service) OnGetTools(valid backendshare.Valid, req GetToolReq) (ret GetToolRet, err error) {
	ret.ID2ToolData = s.toolMgr.GetAllTool()
	return
}

func (s *Service) OnGetToolScript(valid backendshare.Valid, req GetToolScriptReq) (ret GetToolScriptRet, err error) {
	Tool, err := s.toolMgr.GetTool(req.ToolID)
	if err != nil {
		err = errors.Join(errors.New("get tool failed"), err)
		return
	}
	ret.Script = Tool.GetContent()
	return
}

func (s *Service) OnCreateEnv(valid backendshare.Valid, req CreateEnvReq) (ret CreateEnvRet, err error) {
	env := s.runMgr.CreateEnv()
	if env == nil {
		err = errors.New("create env failed")
		return
	}
	ret.EnvID = env.ID
	ret.Suc = true
	return
}

func (s *Service) OnGetEnvs(valid backendshare.Valid, req GetEnvsReq) (ret GetEnvsRet, err error) {
	ids := s.runMgr.GetEnvIDs()
	ret.EnvData = make([]run.EnvData, 0)
	for _, id := range ids {
		env := s.runMgr.GetEnv(id)
		if env == nil {
			continue
		}
		ret.EnvData = append(ret.EnvData, env.EnvData)
	}
	return
}

func (s *Service) OnGetEnv(valid backendshare.Valid, req GetEnvReq) (ret GetEnvRet, err error) {
	env := s.runMgr.GetEnv(req.EnvID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	ret.EnvData = env.EnvData
	ret.AllFiles = env.GetDirFile()
	return
}

func (s *Service) OnGetFile(valid backendshare.Valid, req GetFileReq) (ret GetFileRet, err error) {
	env := s.runMgr.GetEnv(req.EnvID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	ret.Content, err = env.GetTxtFile(req.FileName)
	if err != nil {
		err = errors.Join(errors.New("get file failed"), err)
		return
	}
	return
}

func (s *Service) OnSetFile(valid backendshare.Valid, req SetFileReq) (ret SetFileRet, err error) {
	env := s.runMgr.GetEnv(req.EnvID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	err = env.UpdateTxtFile(req.FileName, req.Content)
	if err != nil {
		err = errors.Join(errors.New("update file failed"), err)
		return
	}
	return
}

func (s *Service) OnSetEnv(valid backendshare.Valid, req SetEnvReq) (ret SetEnvRet, err error) {
	env := s.runMgr.GetEnv(req.EnvID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	if req.note != "" {
		env.SetNote(req.note)
	}
	if req.bindToolID != "" {
		env.SetDefaultTool(req.bindToolID)
	}
	if req.params != nil {
		env.SetParam(req.params)
	}
	err = env.Save()
	if err != nil {
		err = errors.Join(errors.New("save env failed"), err)
		return
	}
	return
}

func (s *Service) OnRunEnv(valid backendshare.Valid, req RunEnvReq) (ret RunEnvRet, err error) {
	env := s.runMgr.GetEnv(req.EnvID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	useTool, err := s.toolMgr.GetTool(req.ToolID)
	if err != nil {
		err = errors.Join(errors.New("get tool failed"), err)
		return
	}
	err = env.RunTask(useTool, req.Params)
	if err != nil {
		err = errors.Join(errors.New("run task failed"), err)
		return
	}
	return
}

func (s *Service) OnGetTasks(valid backendshare.Valid, req GetTasksReq) (ret GetTasksRet, err error) {
	env := s.runMgr.GetEnv(req.EvnID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}

	ret.TaskData = make([]struct {
		TaskIndex int
		Status    run.TaskStatus
	}, 0)
	for i := 0; i < env.GetTaskLen(); i++ {
		task := env.GetTask(i)
		if task == nil {
			continue
		}
		ret.TaskData = append(ret.TaskData, struct {
			TaskIndex int
			Status    run.TaskStatus
		}{
			TaskIndex: i,
			Status:    env.GetTask(i).GetStatus(),
		})
	}
	return
}

func (s *Service) OnGetTask(valid backendshare.Valid, req GetTaskReq) (ret GetTaskRet, err error) {
	env := s.runMgr.GetEnv(req.EnvID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	task := env.GetTask(req.TaskIndex)
	if task == nil {
		err = errors.New("get task failed")
		return
	}
	ret.IOs = task.GetNewIO(req.LastIndex)
	ret.Status = task.GetStatus()
	ret.IOs = task.GetNewIO(req.LastIndex)
	return
}

func (s *Service) OnStopTask(valid backendshare.Valid, req StopTaskReq) (ret StopTaskRet, err error) {
	env := s.runMgr.GetEnv(req.EvnID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	task := env.GetTask(req.TaskIndex)
	if task == nil {
		err = errors.New("get task failed")
		return
	}
	task.Stop()
	return
}

func (s *Service) OnTaskInput(valid backendshare.Valid, req TaskInputReq) (ret TaskInputRet, err error) {
	env := s.runMgr.GetEnv(req.EvnID)
	if env == nil {
		err = errors.New("get env failed")
		return
	}
	task := env.GetTask(req.TaskIndex)
	if task == nil {
		err = errors.New("get task failed")
		return
	}
	err = task.Input(req.Content)
	if err != nil {
		err = errors.Join(errors.New("task input failed"), err)
		return
	}
	return
}
