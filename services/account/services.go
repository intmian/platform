package account

import (
	share2 "github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/services/share"
	"github.com/pkg/errors"
)

type Service struct {
	share share.ServiceShare
	acc   accountMgr
}

func (s *Service) Start(share share.ServiceShare) error {
	err := s.acc.Init()
	if err != nil {
		return errors.WithMessage(err, "acc Init err")
	}
}

func (s *Service) Stop() error {
	//TODO implement me
	panic("implement me")
}

func (s *Service) Handle(msg share.Msg, valid share2.Valid) error {
	//TODO implement me
	panic("implement me")
}

func (s *Service) HandleRpc(msg share.Msg, valid share2.Valid) (interface{}, error) {
	//TODO implement me
	panic("implement me")
}
