package backend

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/backend/global"
)

func InitRoot(r *gin.Engine) {

	//r.Static("/page", "./frontend")
	// 接入管理员后端
	r.POST("/login", login)
	r.POST("/logout", logout)
	r.POST("/check", check)
	admin := r.Group("/admin", checkAdmin)
	admin.POST("/services", getServices)
	admin.POST("/service/:name/start", startService)
	admin.POST("/service/:name/stop", stopService)
	admin.POST("/storage/get", global.GStoWebPack.WebGet)
	admin.POST("/storage/set", global.GStoWebPack.WebSet)
	admin.POST("/storage/get_all", global.GStoWebPack.WebGetAll)
	admin.POST("/log/get", getLastLog)

	// 服务的直通接口
	r.POST("/service/:name/:cmd", serviceHandle)
}
