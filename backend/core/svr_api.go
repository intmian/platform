package core

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/xstorage"
	share2 "github.com/intmian/platform/backend/services/share"
	"github.com/intmian/platform/backend/share"
	"time"
)

func serviceHandle(c *gin.Context) {
	name := c.Param("name")
	cmd := c.Param("cmd")
	bodyStr, err := c.GetRawData()
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Get body error",
		})
		return
	}
	flag := getFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	msg := share2.MakeMsgJson(share2.Cmd(cmd), string(bodyStr))
	valid := getValid(c)
	t1 := time.Now()
	finish := make(chan interface{})
	go func() {
		<-finish
		delta := time.Now().Sub(t1)
		if delta > time.Minute {
			gLog.Warning("PLAT", "serviceHandle too long [%s] [%s] [%s]", name, cmd, delta.String())
		}
	}()
	rec, err := GPlatCore.onRecRpc(flag, msg, valid)
	finish <- nil
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Rpc error",
		})
		return
	}
	c.JSON(200, gin.H{
		"code": 0,
		"data": rec,
	})
}

func cfgPlatSet(c *gin.Context) {
	valid := getValid(c)
	if !valid.HasPermission("admin") && !valid.HasPermission("plat.cfg") {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "no permission",
		})
		return
	}
	opr := struct {
		Key string `json:"key"`
		Val string `json:"val"`
	}{}
	err := c.BindJSON(&opr)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "illegal param",
		})
		return
	}

	err = gCfg.Set(xstorage.Join("PLAT", opr.Key), opr.Val)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "inner error",
		})
		return
	}
}

func cfgServiceSet(c *gin.Context) {
	// 暂时先全在core校验权限，后续可以考虑拆分
	svr := c.Param("svr")
	if getFlag(share.SvrName(svr)) == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	valid := getValid(c)
	if !valid.HasPermission(getStr2Permission(svr, "cfg")) && !valid.HasPermission("admin") {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "no permission",
		})
		return
	}
	opr := struct {
		Key string `json:"key"`
		Val string `json:"val"`
	}{}
	err := c.BindJSON(&opr)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "illegal param",
		})
		return
	}

	err = gCfg.Set(xstorage.Join(svr, opr.Key), opr.Val)
}

func cfgServiceUserSet(c *gin.Context) {
	// 暂时先不校验权限，后面看情况再说
	svr := c.Param("svr")
	user := c.Param("user")
	opr := struct {
		Key string `json:"key"`
		Val string `json:"val"`
	}{}
	err := c.BindJSON(&opr)
	if err != nil {
		c.JSON(200, makeErrReturn("illegal param"))
		return
	}

	err = gCfg.SetUser(user, xstorage.Join(svr, opr.Key), opr.Val)
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}

	c.JSON(200, makeOkReturn(nil))
}

func cfgPlatGet(c *gin.Context) {
	valid := getValid(c)
	if !valid.HasPermission("admin") && !valid.HasPermission("plat.cfg") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	val, err := gCfg.GetAll()
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}

func cfgServiceGet(c *gin.Context) {
	svr := c.Param("svr")
	if getFlag(share.SvrName(svr)) == share.FlagNone {
		c.JSON(200, makeErrReturn("service not exist"))
		return
	}
	valid := getValid(c)
	if !valid.HasPermission(getStr2Permission(svr, "cfg")) && !valid.HasPermission("admin") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	val, err := gCfg.GetWithFilter(svr+".", "")
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}

func cfgServiceUserGet(c *gin.Context) {
	svr := c.Param("svr")
	user := c.Param("user")
	val, err := gCfg.GetWithFilter(svr+".", user)
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}
