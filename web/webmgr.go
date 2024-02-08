package web

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/core"
)

var GWebMgr Mgr

func Init() {
	GWebMgr.Init()
}

type Mgr struct {
	p xstorage.WebPack
}

func (m *Mgr) Init() {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.Default()
	InitRoot(engine)
	s := core.GPlatCore.GetWebSetting()
	err := engine.Run(":" + s.WebPort)
	if err != nil {
		panic(err)
	}
}
