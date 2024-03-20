package account

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	backendshare "github.com/intmian/platform/backend/share"
	accShare "github.com/intmian/platform/services/account/share"
	"github.com/intmian/platform/services/share"
)

type Service struct {
	share share.ServiceShare
	acc   accountMgr
}

func (s *Service) GetProp() share.ServiceProp {
	// 可能多个plat共享一个account，所以是可选的
	return misc.CreateProperty(share.SvrPropCoreOptional)
}

func (s *Service) Start(share share.ServiceShare) error {
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

func (s *Service) Handle(msg share.Msg, valid backendshare.Valid) {
	// NOTHING
	return
}

func (s *Service) HandleRpc(msg share.Msg, valid backendshare.Valid) (interface{}, error) {
	switch msg.Cmd() {
	case accShare.CmdRegister:
		return share.HandleRpcTool("register", msg, valid, s.OnRegister)
	case accShare.CmdDeregister:
		return share.HandleRpcTool("deregister", msg, valid, s.OnDeregister)
	case accShare.CmdCheckToken:
		return share.HandleRpcTool("checkToken", msg, valid, s.OnCheckToken)
	default:
		return nil, errors.New("unknown cmd")
	}
}

func (s *Service) OnRegister(valid backendshare.Valid, req accShare.RegisterReq) (ret accShare.RegisterRet, err error) {
	if !valid.HasPermission(backendshare.PermissionAdmin) {
		return ret, nil
	}
	var errs []error
	for pwd, pers := range req.Pwd2permissions {
		for _, per := range pers {
			err := s.acc.register(req.Account, pwd, per, valid.GetFrom())
			errs = append(errs, err)
			if err == nil {
				ret.Suc[pwd] = append(ret.Suc[pwd], per)
			}
		}
	}
	err = errors.Join(errs...)
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
