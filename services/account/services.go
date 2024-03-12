package account

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	share2 "github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/services/share"
)

type Service struct {
	share share.ServiceShare
	acc   accountMgr
}

func (s *Service) GetProp() share.ServiceProp {
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
	//TODO implement me
	panic("implement me")
}

func (s *Service) HandleRpc(msg share.Msg, valid share2.Valid) (interface{}, error) {
	switch msg.Cmd() {
	case de:

	}
}
