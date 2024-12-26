package auto

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/platform/backend/services/auto/setting"
	"github.com/intmian/platform/backend/services/auto/task"
	"github.com/intmian/platform/backend/services/auto/tool"
	share2 "github.com/intmian/platform/backend/share"
)

type Service struct {
	share share2.ServiceShare
}

func (s *Service) DebugCommand(req share2.DebugReq) interface{} {
	//TODO implement me
	panic("implement me")
}

func (s *Service) GetProp() share2.ServiceProp {
	return misc.CreateProperty(share2.SvrPropMicro)
}

func (s *Service) HandleRpc(msg share2.Msg, valid share2.Valid) (interface{}, error) {
	if !(valid.HasPermission("admin") || valid.HasPermission("auto")) {
		return nil, errors.New("no permission")
	}
	switch msg.Cmd() {
	default:
	}
	return nil, nil
}

func (s *Service) Handle(msg share2.Msg, valid share2.Valid) {
	switch msg.Cmd() {
	default:

	}
	return
}

func (s *Service) Start(share share2.ServiceShare) error {
	s.share = share
	setting.GSetting = share.Storage
	tool.Init(share.Push, share.Log)
	tool.GLog.Info("AUTO", "初始化开始")
	task.Init()
	tool.GLog.Info("AUTO", "task初始化完成")
	// 网页被做到了外部，因此这里不需要了
	//ok, isDebug, err := xstorage.Get[bool](setting.GSetting, "web.debug")
	//if ok && isDebug {
	//	gin.SetMode(gin.DebugMode)
	//} else {
	//	gin.SetMode(gin.ReleaseMode)
	//}
	//gin.DisableConsoleColor()
	//f, _ := os.Create("static/gin.log")
	//gin.DefaultWriter = io.MultiWriter(f)
	//r := gin.Default()
	//http.RegisterWeb(r)
	//tool.GLog.Info("SYS", "web初始化完成")
	//ok, port, err := xstorage.Get[string](setting.GSetting, "web.port")
	//if !ok {
	//	err = r.Run(":8080")
	//} else {
	//	err = r.Run(":" + port)
	//}
	//if err != nil {
	//	tool.GLog.Info("SYS", "web启动失败")
	//}

	tool.GLog.Info("AUTO", "初始化完成")

	return nil
}

func (s *Service) Stop() error {
	task.GMgr.AllStop()
	return nil
}

func (s *Service) RegisterWeb(gin *gin.Engine) {
	// TODO:目前先只通过重启服务的方式进行，后续再说
}

func (s *Service) DeregisterWeb(gin *gin.Engine) {

}
