package main

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/mian_go_lib/tool/xlog"
	"github.com/intmian/platform/services/auto/http"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/task"
	"github.com/intmian/platform/services/auto/tool"
	"io"
	"os"
)

func main() {
	println("doing....")
	tool.Init()
	tool.GLog.Log(xlog.ELog, "SYS", "初始化开始")
	task.Init()
	tool.GLog.Log(xlog.ELog, "SYS", "task初始化完成")

	if setting.GSettingMgr.Exist("web.debug") && setting.GSettingMgr.Get("web.debug").(bool) {
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
	var err error
	if setting.GSettingMgr.Get("web.port") == nil {
		err = r.Run(":8080")
	} else {
		port := ":" + setting.GSettingMgr.Get("web.port").(string)
		err = r.Run(port)
	}

	if err != nil {
		tool.GLog.Log(xlog.ELog, "SYS", "web启动失败")
	}

}
