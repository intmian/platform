package todone

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/logic"
	backendshare "github.com/intmian/platform/backend/share"
)

// Service 业务
type Service struct {
	share   backendshare.ServiceShare
	userMgr logic.UserMgr
	cancel  context.CancelFunc
}

func loadWorkerConfig(serviceShare backendshare.ServiceShare) (string, string, error) {
	params := []*xstorage.CfgParam{
		{
			Key:       xstorage.Join("todone", "db", "worker_endpoint"),
			ValueType: xstorage.ValueTypeString,
		},
		{
			Key:       xstorage.Join("todone", "db", "worker_token"),
			ValueType: xstorage.ValueTypeString,
		},
	}
	for _, param := range params {
		if err := serviceShare.Cfg.AddParam(param); err != nil && !errors.Is(err, xstorage.ErrKeyAlreadyExist) {
			return "", "", errors.Join(errors.New("add worker cfg param failed"), err)
		}
	}

	endpointUnit, err := serviceShare.Cfg.Get("todone", "db", "worker_endpoint")
	if err != nil {
		return "", "", errors.Join(errors.New("get worker endpoint failed"), err)
	}
	tokenUnit, err := serviceShare.Cfg.Get("todone", "db", "worker_token")
	if err != nil {
		return "", "", errors.Join(errors.New("get worker token failed"), err)
	}
	endpoint := strings.TrimSpace(xstorage.ToBase[string](endpointUnit))
	token := strings.TrimSpace(xstorage.ToBase[string](tokenUnit))
	if value := strings.TrimSpace(os.Getenv("PLATFORM_TODONE_WORKER_ENDPOINT")); value != "" {
		endpoint = value
	}
	if value := strings.TrimSpace(os.Getenv("PLATFORM_TODONE_WORKER_TOKEN")); value != "" {
		token = value
	}
	if endpoint == "" {
		return "", "", errors.New("todone.db.worker_endpoint is empty")
	}
	if token == "" {
		return "", "", errors.New("todone.db.worker_token is empty")
	}
	return endpoint, token, nil
}

func (s *Service) Start(share backendshare.ServiceShare) error {
	s.share = share
	logic.GTodoneShare = &s.share
	logic.GTodoneCtx, s.cancel = context.WithCancel(s.share.Ctx)
	begin := time.Now()
	s.share.Log.Info("TODONE", "启动服务")
	workerEndpoint, workerToken, err := loadWorkerConfig(share)
	if err != nil {
		return err
	}
	err = db.InitGMgr(db.Setting{
		WorkerEndpoint: workerEndpoint,
		WorkerToken:    workerToken,
		Ctx:            share.Ctx,
		XBi:            share.Bi,
		XLog:           share.Log,
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
	logic.GTodoneShare = nil
	s.cancel()
	logic.GTodoneCtx = nil
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
	case CmdGetTask:
		return backendshare.HandleRpcTool("getTask", msg, valid, s.OnGetTask)
	case CmdChangeTask:
		return backendshare.HandleRpcTool("changeTask", msg, valid, s.OnChangeTask)
	case CmdCreateTask:
		return backendshare.HandleRpcTool("createTask", msg, valid, s.OnCreateTask)
	case CmdDelTask:
		return backendshare.HandleRpcTool("delTask", msg, valid, s.OnDelTask)
	case CmdCreateSubGroup:
		return backendshare.HandleRpcTool("createSubGroup", msg, valid, s.OnCreateSubGroup)
	case CmdDelSubGroup:
		return backendshare.HandleRpcTool("delSubGroup", msg, valid, s.OnDelSubGroup)
	case CmdGetTasks:
		return backendshare.HandleRpcTool("getTasks", msg, valid, s.OnGetTasks)
	case CmdChangeSubGroup:
		return backendshare.HandleRpcTool("subGroup", msg, valid, s.OnSubGroup)
	case CmdTaskMove:
		return backendshare.HandleRpcTool("taskMove", msg, valid, s.OnTaskMove)
	case CmdTaskAddTag:
		return backendshare.HandleRpcTool("taskAddTag", msg, valid, s.OnTaskAddTag)
	case CmdTaskDelTag:
		return backendshare.HandleRpcTool("taskDelTag", msg, valid, s.OnTaskDelTag)
	}

	return nil, errors.New("cmd not found")
}

func (s *Service) GetProp() backendshare.ServiceProp {
	// 可能多个plat共享一个account，所以是可选的
	return misc.CreateProperty(backendshare.SvrPropMicro)
}

func (s *Service) DebugCommand(req backendshare.DebugReq) interface{} {
	return nil
}
