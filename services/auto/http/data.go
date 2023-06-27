package http

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/services/auto/log_cache"
	"github.com/intmian/platform/services/auto/status"
	"github.com/intmian/platform/services/auto/task"
)

func getLogCache(c *gin.Context) {
	//输出json结果给调用方
	c.String(200, log_cache.GLogCache.ToString())
}

func getStatus(c *gin.Context) {
	c.String(200, task.GMgr.MakeStatusText())
}

func getTitle(c *gin.Context) {
	c.String(200, status.GStatus.GetTimeStr())
}

func startTask(c *gin.Context) {
	taskName := c.Query("name")
	if taskName == "" {
		c.String(200, "task name is empty")
	}
	if task.GMgr.UnitDo(taskName) {
		c.String(200, "ok")
	} else {
		c.String(200, "not found")
	}
}
