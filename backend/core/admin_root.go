package core

import (
	"github.com/gin-gonic/gin"
)

func initAdminRoot(r *gin.Engine) {
	//r.Static("/page", "./frontend")
	// 接入管理员后端
	r.POST("/login", login)
	r.POST("/logout", logout)
	r.POST("/check", check)
	admin := r.Group("/admin", checkAdmin)
	admin.POST("/services", getServices)
	admin.POST("/service/:name/start", startService)
	admin.POST("/service/:name/stop", stopService)
	admin.POST("/storage/get", gStoWebPack.WebGet)
	admin.POST("/storage/set", gStoWebPack.WebSet)
	admin.POST("/storage/get_all", gStoWebPack.WebGetAll)
	admin.POST("/log/get", getLastLog)
}
