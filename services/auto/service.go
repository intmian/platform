package auto

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/mian_go_lib/tool/xstorage"
	"github.com/intmian/platform/services/auto/http"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/task"
	"github.com/intmian/platform/services/auto/tool"
	"github.com/intmian/platform/services/share"
	"io"
	"os"
)

type Service struct {
	share share.ServiceShare
	share.ServiceBase
}

func (s Service) Start(share share.ServiceShare) error {
	s.share = share
	setting.GSetting = share.Storage
	tool.Init(share.Push, share.Log)
	tool.GLog.Log(xlog.ELog, "SYS", "初始化开始")
	task.Init()
	tool.GLog.Log(xlog.ELog, "SYS", "task初始化完成")
	ok, isDebug, err := xstorage.Get[bool](setting.GSetting, "web.debug")
	if ok && isDebug {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}
	gin.DisableConsoleColor()
	f, _ := os.Create("static/gin.log")
	gin.DefaultWriter = io.MultiWriter(f)
	r := gin.Default()
	http.InitRoot(r)
	tool.GLog.Log(xlog.ELog, "SYS", "web初始化完成")
	tool.GLog.Log(xlog.ELog, "SYS", "初始化完成")

	ok, port, err := xstorage.Get[string](setting.GSetting, "web.port")
	if !ok {
		err = r.Run(":8080")
	} else {
		err = r.Run(":" + port)
	}

	if err != nil {
		tool.GLog.Log(xlog.ELog, "SYS", "web启动失败")
	}
	return nil
}

func (s Service) Stop() error {
	task.GMgr.AllStop()
	return nil
}
