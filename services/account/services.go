package account

import (
	share2 "github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/services/share"
)

type Service struct {
	share share.ServiceShare
}

func (s *Service) Start(share share.ServiceShare) error {
	//TODO implement me
	panic("implement me")
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
