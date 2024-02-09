package auto

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/task"
	"github.com/intmian/platform/services/auto/tool"
	"github.com/intmian/platform/services/share"
)

type Service struct {
	share share.ServiceShare
}

func (s *Service) Start(share share.ServiceShare) error {
	s.share = share
	setting.GSetting = share.Storage
	tool.Init(share.Push, share.Log)
	tool.GLog.Info("SYS", "初始化开始")
	task.Init()
	tool.GLog.Info("SYS", "task初始化完成")

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

	tool.GLog.Info("SYS", "初始化完成")

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
