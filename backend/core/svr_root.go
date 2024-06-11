package core

import (
	"github.com/gin-gonic/gin"
)

func initSvrRoot(r *gin.Engine) {
	// 服务的直通接口
	r.POST("/service/:name/:cmd", serviceHandle)

	// 目前所有的配置全部注册在主服务处，后续可以拆分为配置服，用来同步配置
	r.POST("/cfg/plat/set", cfgPlatSet)
	r.POST("/cfg/:svr/set", cfgServiceSet)
	r.POST("/cfg/:svr/:user/set", cfgServiceUserSet)
	r.POST("/cfg/plat/get", cfgPlatGet)
	r.POST("/cfg/:svr/get", cfgServiceGet)
	r.POST("/cfg/:svr/:user/get", cfgServiceUserGet)
}
