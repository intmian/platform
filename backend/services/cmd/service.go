package cmd

import (
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/platform/backend/services/cmd/run"
	"github.com/intmian/platform/backend/services/cmd/tool"
	backendshare "github.com/intmian/platform/backend/share"
)

type Service struct {
	share   backendshare.ServiceShare
	toolMgr tool.ToolMgr
	runMgr  run.RunMgr
}

func (s *Service) Start(share backendshare.ServiceShare) error {
	//TODO implement me
	panic("implement me")
}

func (s *Service) Stop() error {
	//TODO implement me
	panic("implement me")
}

func (s *Service) Handle(msg backendshare.Msg, valid backendshare.Valid) {
	//TODO implement me
	panic("implement me")
}

func (s *Service) HandleRpc(msg backendshare.Msg, valid backendshare.Valid) (interface{}, error) {
	//TODO implement me
	panic("implement me")
}

func (s *Service) GetProp() backendshare.ServiceProp {
	return misc.CreateProperty(backendshare.SvrPropMicro)
}
