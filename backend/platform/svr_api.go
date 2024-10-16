package platform

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/share"
	"time"
)

func (m *webMgr) serviceHandle(c *gin.Context) {
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
	flag := m.plat.getFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	msg := share.MakeMsgJson(share.Cmd(cmd), string(bodyStr))
	valid := m.getValid(c)
	t1 := time.Now()
	finish := make(chan interface{})
	go func() {
		<-finish
		delta := time.Now().Sub(t1)
		if delta > time.Minute {
			m.plat.log.Warning("PLAT", "serviceHandle too long [%s] [%s] [%s]", name, cmd, delta.String())
		}
	}()
	rec, err := m.plat.core.onRecRpc(flag, msg, valid)
	finish <- nil
	if err != nil {
		debug := false
		m.plat.baseSetting.SafeUseData(func(data share.BaseSetting) {
			debug = data.Debug
		}, false)
		if debug {
			c.JSON(200, makeErrReturn(err.Error()))
			return
		}
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "svr error",
		})
		return
	}
	c.JSON(200, gin.H{
		"code": 0,
		"data": rec,
	})
}

type WebDebugParam struct {
	IntValues []int     `json:"ints"`
	F64Values []float64 `json:"f64s"`
	StrValues []string  `json:"strs"`
}

func (m *webMgr) serviceDebugHandle(c *gin.Context) {
	m.plat.baseSetting.SafeUseData(func(data share.BaseSetting) {
		if data.Debug == false {
			c.JSON(200, makeErrReturn("debug not open"))
		}
	}, false)
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
	flag := m.plat.getFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, makeErrReturn("service not exist"))
		return
	}
	webDebugParam := WebDebugParam{}
	err = json.Unmarshal(bodyStr, &webDebugParam)
	if err != nil {
		c.JSON(200, makeErrReturn("illegal param"))
	}
	svr := m.plat.core.service[flag]
	params := share.DebugParams{}
	params.IntParams.Append(webDebugParam.IntValues...)
	params.F64Params.Append(webDebugParam.F64Values...)
	params.StrParams.Append(webDebugParam.StrValues...)
	ret := svr.DebugCommand(share.DebugReq{
		Cmd:    cmd,
		Params: params,
	})
	c.JSON(200, makeOkReturn(ret))
}

func (m *webMgr) cfgPlatSet(c *gin.Context) {
	valid := m.getValid(c)
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

	err = m.plat.cfg.Set(xstorage.Join("PLAT", opr.Key), opr.Val)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "inner error",
		})
		return
	}
}

func (m *webMgr) cfgServiceSet(c *gin.Context) {
	// 暂时先全在core校验权限，后续可以考虑拆分
	svr := c.Param("svr")
	if m.plat.getFlag(share.SvrName(svr)) == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	valid := m.getValid(c)
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

	err = m.plat.cfg.Set(xstorage.Join(svr, opr.Key), opr.Val)
}

func (m *webMgr) cfgServiceUserSet(c *gin.Context) {
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

	err = m.plat.cfg.SetUser(user, xstorage.Join(svr, opr.Key), opr.Val)
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}

	c.JSON(200, makeOkReturn(nil))
}

func (m *webMgr) cfgPlatGet(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasPermission("admin") && !valid.HasPermission("plat.cfg") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	val, err := m.plat.cfg.GetAll()
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}

func (m *webMgr) cfgServiceGet(c *gin.Context) {
	svr := c.Param("svr")
	if m.plat.getFlag(share.SvrName(svr)) == share.FlagNone {
		c.JSON(200, makeErrReturn("service not exist"))
		return
	}
	valid := m.getValid(c)
	if !valid.HasPermission(getStr2Permission(svr, "cfg")) && !valid.HasPermission("admin") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	val, err := m.plat.cfg.GetWithFilter(svr+".", "")
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}

func (m *webMgr) cfgServiceUserGet(c *gin.Context) {
	svr := c.Param("svr")
	user := c.Param("user")
	val, err := m.plat.cfg.GetWithFilter(svr+".", user)
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}
