package todone

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/logic"
	backendshare "github.com/intmian/platform/backend/share"
	"time"
)

// Service 业务
type Service struct {
	share   backendshare.ServiceShare
	userMgr logic.UserMgr
}

func (s *Service) Start(share backendshare.ServiceShare) error {
	s.share = share
	begin := time.Now()
	s.share.Log.Info("TODONE", "启动服务")
	// 注册配置
	err1 := share.Cfg.AddParam(&xstorage.CfgParam{
		Key:       xstorage.Join("todone", "db", "account_id"),
		ValueType: xstorage.ValueTypeString,
	})
	err2 := share.Cfg.AddParam(&xstorage.CfgParam{
		Key:       xstorage.Join("todone", "db", "api_token"),
		ValueType: xstorage.ValueTypeString,
	})
	err3 := share.Cfg.AddParam(&xstorage.CfgParam{
		Key:       xstorage.Join("todone", "db", "db_id"),
		ValueType: xstorage.ValueTypeString,
	})
	err := errors.Join(err1, err2, err3)
	if err != nil && !errors.Is(err, xstorage.ErrKeyAlreadyExist) {
		return errors.Join(errors.New("add cfg param failed"), err)
	}

	// 获取配置
	accIDU, _ := share.Cfg.Get(xstorage.Join("todone", "db", "account_id"))
	apiTokenU, _ := share.Cfg.Get(xstorage.Join("todone", "db", "api_token"))
	dbIDU, _ := share.Cfg.Get(xstorage.Join("todone", "db", "db_id"))

	// 初始化管理器就行
	err = db.InitGMgr(db.Setting{
		AccountID: xstorage.ToBase[string](accIDU),
		ApiToken:  xstorage.ToBase[string](apiTokenU),
		DBID:      xstorage.ToBase[string](dbIDU),
	})
	if err != nil {
		return errors.Join(errors.New("init db mgr failed"), err)
	}

	// 因为stop时会释放资源，所以这里不需要重新初始化

	s.share.Log.Info("TODONE", "启动成功耗时 %.2fs", time.Since(begin).Seconds())

	return nil
}

func (s *Service) Stop() error {
	// 释放管理器以释放资源
	s.userMgr = logic.UserMgr{}

	return nil
}

func (s *Service) Handle(msg backendshare.Msg, valid backendshare.Valid) {
	return
}

func (s *Service) HandleRpc(msg backendshare.Msg, valid backendshare.Valid) (interface{}, error) {
	// 进行权限校验
	if !valid.HasOnePermission("admin", "todone") {
		return nil, errors.New("no permission")
	}
	var user struct {
		UserID string
	}
	err := msg.Data(&user)
	if err != nil {
		return nil, errors.New("data err")
	}
	if user.UserID == "" || user.UserID != valid.User {
		return nil, errors.New("user err")
	}

	switch msg.Cmd() {
	case CmdGetDirTree:
		return backendshare.HandleRpcTool("getDirTree", msg, valid, s.OnGetDirTree)
	case CmdMoveDir:
		return backendshare.HandleRpcTool("moveDir", msg, valid, s.OnMoveDir)
	case CmdMoveGroup:
		return backendshare.HandleRpcTool("moveGroup", msg, valid, s.OnMoveGroup)
	case CmdCreateDir:
		return backendshare.HandleRpcTool("createDir", msg, valid, s.OnCreateDir)
	case CmdChangeDir:
		return backendshare.HandleRpcTool("changeDir", msg, valid, s.OnChangeDir)
	case CmdDelDir:
		return backendshare.HandleRpcTool("delDir", msg, valid, s.OnDelDir)
	case CmdDelGroup:
		return backendshare.HandleRpcTool("delGroup", msg, valid, s.OnDelGroup)
	case CmdCreateGroup:
		return backendshare.HandleRpcTool("createGroup", msg, valid, s.OnCreateGroup)
	case CmdChangeGroup:
		return backendshare.HandleRpcTool("changeGroup", msg, valid, s.OnChangeGroup)
	case CmdGetSubGroup:
		return backendshare.HandleRpcTool("getSubGroup", msg, valid, s.OnGetSubGroup)
	case CmdGetTaskByPage:
		return backendshare.HandleRpcTool("getTaskByPage", msg, valid, s.OnGetTaskByPage)
	case CmdGetTask:
		return backendshare.HandleRpcTool("getTask", msg, valid, s.OnGetTask)
	case CmdChangeTask:
		return backendshare.HandleRpcTool("changeTask", msg, valid, s.OnChangeTask)
	case CmdCreateTask:
		return backendshare.HandleRpcTool("createTask", msg, valid, s.OnCreateTask)
	case CmdDelTask:
		return backendshare.HandleRpcTool("delTask", msg, valid, s.OnDelTask)
	}

	return nil, nil
}

func (s *Service) GetProp() backendshare.ServiceProp {
	// 可能多个plat共享一个account，所以是可选的
	return misc.CreateProperty(backendshare.SvrPropMicro)
}

func (s *Service) DebugCommand(req backendshare.DebugReq) interface{} {
	return nil
}
