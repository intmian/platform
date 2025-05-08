package platform

import (
	"github.com/gin-gonic/gin"
)

func (m *webMgr) initSvrRoot(r *gin.Engine) {
	// 服务的直通接口
	r.POST("/service/:name/:cmd", m.serviceHandle)
	r.POST("/debug/:name/:cmd", m.serviceDebugHandle)

	// 目前所有的配置全部注册在主服务处，后续可以拆分为配置服，用来同步配置
	r.POST("/cfg/plat/set", m.cfgPlatSet)
	r.POST("/cfg/:svr/set", m.cfgServiceSet)
	r.POST("/cfg/:svr/:user/set", m.cfgServiceUserSet)
	r.POST("/cfg/plat/get", m.cfgPlatGet)
	r.POST("/cfg/:svr/get", m.cfgServiceGet)
	r.POST("/cfg/:svr/:user/get", m.cfgServiceUserGet)

	// 未来可能迁移到misc
	r.POST("/misc/gpt-rewrite", m.gptRewrite)
	r.POST("/misc/r2-presigned-url", m.getR2PresignedURL)
}
