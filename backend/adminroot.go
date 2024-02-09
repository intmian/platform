package backend

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/backend/global"
)

func InitRoot(r *gin.Engine) {
	// 接入前端
	r.Static("/", "./frontend")
	// 接入管理员后端
	r.POST("/api/login", login)
	admin := r.Group("/api/admin", checkAdmin)
	admin.POST("/api/admin/services", getServices)
	admin.POST("/api/admin/service/:name/start", startService)
	admin.POST("/api/admin/service/:name/stop", stopService)
	admin.POST("/api/admin/storage/get", global.GStoWebPack.WebGet)
	admin.POST("/api/admin/storage/set", global.GStoWebPack.WebSet)
	admin.POST("/api/admin/storage/get_all", global.GStoWebPack.WebGetAll)
}
