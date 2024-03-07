package account

import (
	"github.com/intmian/platform/backend"
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

func (s *Service) Handle(msg share.Msg, valid backend.Valid) error {
	//TODO implement me
	panic("implement me")
}

func (s *Service) HandleRpc(msg share.Msg, valid backend.Valid) (interface{}, error) {
	//TODO implement me
	panic("implement me")
}
