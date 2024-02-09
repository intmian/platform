package web

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/platform/core"
	"github.com/intmian/platform/core/share"
	"github.com/intmian/platform/core/tool"
	"github.com/intmian/platform/global"
	"time"
)

func login(c *gin.Context) {
	// 获得密码
	usr := c.PostForm("usr")
	sec := c.PostForm("sec")
	if usr != "admin" && sec != "123456" {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "password error",
		})
		return
	}
	// 生成token
	data := token.Data{
		User:       usr,
		Permission: []string{"admin"},
		ValidTime:  int64(time.Hour * 24 * 7 / time.Second),
	}
	t := GWebMgr.jwt.GenToken(usr, data.Permission, data.ValidTime)
	data.Token = t
	// 保存token
	tokenS, _ := json.Marshal(data)
	c.SetCookie("token", string(tokenS), 60*60*24*7, "/", "", false, true)
}

func checkAdmin(c *gin.Context) {
	// 从cookie中获得token
	tokenS, err := c.Cookie("token")
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token not exist",
		})
		c.Abort()
		return
	}
	// 解析token
	var data token.Data
	err = json.Unmarshal([]byte(tokenS), &data)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token invalid",
		})
		c.Abort()
		return
	}
	if !GWebMgr.checkSignature(&data, "admin") {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token invalid",
		})
	}
}

func getServices(c *gin.Context) {
	info := core.GPlatCore.GetWebInfo()
	c.JSON(200, info)
}

func startService(c *gin.Context) {
	name := c.Param("name")
	flag := tool.GetFlag(share.SvrName(name))
	if flag == share.FlagNone {
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
	flag := tool.GetFlag(share.SvrName(name))
	if flag == share.FlagNone {
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
	logs, err := global.GNews.GetTopic("PLAT")
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return
	}
	c.JSON(200, logs)
}
