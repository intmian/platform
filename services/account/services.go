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
		var req accShare.RegisterReq
		err := msg.Data(&req)
		if err != nil {
			return nil, errors.Join(err, errors.New("CmdRegister data err"))
		}
		ret, err := s.OnRegister(valid, req)
		if err != nil {
			return nil, errors.Join(err, errors.New("CmdRegister handle err"))
		}
		return ret, err
	default:
		return nil, errors.New("unknown cmd")
	}
}

func (s *Service) OnRegister(valid backendshare.Valid, req accShare.RegisterReq) (accShare.RegisterRet, error) {
	var ret accShare.RegisterRet
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
	err := errors.Join(errs...)
	return ret, err
}
