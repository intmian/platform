package platform

import (
	"github.com/gin-gonic/gin"
)

func (m *webMgr) initAdminRoot(r *gin.Engine) {
	//r.Static("/page", "./frontend")
	// 接入管理员后端
	r.POST("/login", m.login)
	r.POST("/logout", m.logout)
	r.POST("/check", m.check)
	admin := r.Group("/admin", m.checkAdmin)
	admin.POST("/services", m.getServices)
	admin.POST("/service/:name/start", m.startService)
	admin.POST("/service/:name/stop", m.stopService)
	admin.POST("/storage/get", m.plat.stoWebPack.WebGet)
	admin.POST("/storage/set", m.plat.stoWebPack.WebSet)
	admin.POST("/storage/get_all", m.plat.stoWebPack.WebGetAll)
	admin.POST("/log/get", m.getLastLog)
	admin.POST("/system/usage", m.getSystemUsage)
	admin.GET("/system/usage/sse", m.getSystemUsageSSE)
}
