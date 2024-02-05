package web

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/core"
	"github.com/intmian/platform/core/tool"
)

func getServices(c *gin.Context) {
	info := core.GPlatCore.GetWebInfo()
	c.JSON(200, info)
}

func startService(c *gin.Context) {
	name := c.Param("name")
	flag := tool.GetFlag(core.SvrName(name))
	if flag == core.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	err := core.GPlatCore.StartService(flag)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"code": 0,
		"msg":  "ok",
	})
}

func stopService(c *gin.Context) {
	name := c.Param("name")
	flag := tool.GetFlag(core.SvrName(name))
	if flag == core.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	err := core.GPlatCore.StopService(flag)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"code": 0,
		"msg":  "ok",
	})
}

func getLastLog(c *gin.Context) {
	logs, err := core.GPlatCore.GetLastLog()
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return
	}
	c.JSON(200, logs)
}
