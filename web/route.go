package web

import "github.com/gin-gonic/gin"

func InitRoot(r *gin.Engine) {
	r.GET("/api/services", getServices)
	r.GET("/api/service/:name/start", startService)
	r.GET("/api/service/:name/stop", stopService)
}
