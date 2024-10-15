package account

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	accShare "github.com/intmian/platform/backend/services/account/share"
	backendshare "github.com/intmian/platform/backend/share"
)

type Service struct {
	share backendshare.ServiceShare
	acc   accountMgr
}

func (s *Service) DebugCommand(req backendshare.DebugReq) interface{} {
	//TODO implement me
	panic("implement me")
}

func (s *Service) GetProp() backendshare.ServiceProp {
	// 可能多个plat共享一个account，所以是可选的
	return misc.CreateProperty(backendshare.SvrPropCoreOptional)
}

func (s *Service) Start(share backendshare.ServiceShare) error {
	err := s.acc.Init(share.BaseSetting.AdminPwd)
	if err != nil {
		return errors.Join(err, ErrAccInitErr)
	}
	return nil
}

func (s *Service) Stop() error {
	// 无状态的，不用什么操作
	return nil
}

func (s *Service) Handle(msg backendshare.Msg, valid backendshare.Valid) {
	// NOTHING
	return
}

func (s *Service) HandleRpc(msg backendshare.Msg, valid backendshare.Valid) (interface{}, error) {
	switch msg.Cmd() {
	case accShare.CmdRegister:
		return backendshare.HandleRpcTool("register", msg, valid, s.OnRegister)
	case accShare.CmdDeregister:
		return backendshare.HandleRpcTool("deregister", msg, valid, s.OnDeregister)
	case accShare.CmdCheckToken:
		return backendshare.HandleRpcTool("checkToken", msg, valid, s.OnCheckToken)
	case accShare.CmdDelToken:
		return backendshare.HandleRpcTool("delToken", msg, valid, s.OnDelToken)
	case accShare.CmdChangeToken:
		return backendshare.HandleRpcTool("changeToken", msg, valid, s.OnChangeToken)
	case accShare.CmdGetAllAccount:
		return backendshare.HandleRpcTool("getAllAccount", msg, valid, s.OnGetAllAccount)
	case accShare.CmdCreateToken:
		return backendshare.HandleRpcTool("createToken", msg, valid, s.OnCreateToken)
	default:
		return nil, ErrUnknownCmd
	}
}

func (s *Service) OnRegister(valid backendshare.Valid, req accShare.RegisterReq) (ret accShare.RegisterRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, nil
	}
	creator := valid.User
	if creator == "" {
		creator = "system"
	}
	err = s.acc.register(req.Account, valid.User)
	if err != nil {
		err = errors.Join(err, ErrRegisterFailed)
	}
	return
}

func (s *Service) OnDeregister(valid backendshare.Valid, req accShare.DeregisterReq) (ret accShare.DeregisterRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, nil
	}
	err = s.acc.deregister(req.Account)
	if err == nil {
		ret.Suc = true
	}
	return
}

func (s *Service) OnCheckToken(valid backendshare.Valid, req accShare.CheckTokenReq) (ret accShare.CheckTokenRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, nil
	}
	ret.Pers, err = s.acc.checkPermission(req.Account, req.Pwd)
	return
}

func (s *Service) OnDelToken(valid backendshare.Valid, req accShare.DelTokenReq) (ret accShare.DelTokenRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, nil
	}
	err = s.acc.deletePermission(req.Account, req.TokenID)
	if err == nil {
		ret.Suc = true
	}
	return
}

func (s *Service) OnChangeToken(valid backendshare.Valid, req accShare.ChangeTokenReq) (ret accShare.ChangeTokenRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, nil
	}
	// 目前先不支持自己改自己的,
	err = s.acc.changePermission(req.Account, req.TokenID, req.Pers)
	if err == nil {
		ret.Suc = true
	}
	return
}

func (s *Service) OnGetAllAccount(valid backendshare.Valid, req accShare.GetAllAccountReq) (ret accShare.GetAllAccountRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, errors.New("no permission")
	}
	accountsInfos, err := s.acc.getAllAccount()
	if err != nil {
		return
	}
	ret.Accounts = make(map[string]map[string][]backendshare.Permission)
	for account, infos := range accountsInfos {
		ret.Accounts[account] = make(map[string][]backendshare.Permission)
		for _, info := range infos {
			ret.Accounts[account][info.Token] = info.Permissions
		}
	}
	return
}

func (s *Service) OnCreateToken(valid backendshare.Valid, req accShare.CreateTokenReq) (ret accShare.CreateTokenRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, nil
	}
	tokenID, err := s.acc.addPermission(req.Account, req.Pwd, req.Pers)
	if err == nil {
		ret.TokenID = tokenID
		ret.Suc = true
	}
	return
}
