package web

import "github.com/gin-gonic/gin"

func InitRoot(r *gin.Engine) {
	r.GET("/api/services", getServices)
	r.POST("/api/service/:name/start", startService)
	r.POST("/api/service/:name/stop", stopService)
}
