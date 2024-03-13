package account

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	share2 "github.com/intmian/platform/backend/share"
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

func (s *Service) Handle(msg share.Msg, valid share2.Valid) error {
	// NOTHING
	return errors.New("nothing")
}

func (s *Service) HandleRpc(msg share.Msg, valid share2.Valid) (interface{}, error) {
	type reqRet struct {
		req interface{}
		ret interface{}
	}
	cmdMap := map[share.Cmd]reqRet{}
	cmdMap[accShare.CmdRegister] = reqRet{req: &accShare.RegisterReq{}, ret: &accShare.RegisterRet{}}
	cmdMap[accShare.CmdDeregister] = reqRet{req: &accShare.DeregisterReq{}, ret: &accShare.DeregisterRet{}}
	cmdMap[accShare.CmdCheckToken] = reqRet{req: &accShare.CheckTokenReq{}, ret: &accShare.CheckTokenRet{}}
	switch msg.Cmd() {
	case accShare.CmdRegister:
		var req *accShare.RegisterReq
		err := msg.Data(&req)
		if err != nil {
			return nil, errors.Join(err, errors.New("json.Unmarshal failed"))
		}
	}
}
