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
