package core

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/mian_go_lib/xstorage"
	"io"
	"os"
	"time"
)

// WebMgr web管理器,负责管理gin以及控制台相关，服务的鉴权与内容请从services中处理
type WebMgr struct {
	platStoWebPack xstorage.WebPack
	Jwt            token.JwtMgr
	webEngine      *gin.Engine
}

func (m *WebMgr) Init() {
	if !GBaseSetting.Copy().GinDebug {
		gin.SetMode(gin.ReleaseMode)
		gin.DisableConsoleColor()
		// TODO: 后续改成根据日期作区分的机制
		f, _ := os.Create("gin.log")
		gin.DefaultWriter = io.MultiWriter(f)
	}
	engine := gin.Default()
	m.webEngine = engine
	/*
		接入前端在gin内部只是可选方案之一，开发时建议单独启动后端与vite dev服务
		生产环境下可以选择在这里直接接入，也可以选择在nginx中接入，此服务只做api接口
		后续会不再支持从后端接入前端，因为前端路由会导致后端路由冲突(问题已解决)
		xstorage.ToBaseF[bool](global.GStorage.Get("UseFront"))
	*/
	if misc.PathExist("./front") && GBaseSetting.Copy().UseFront {
		GLog.Info("web", "接入前端")
		m.webEngine.Use(func(c *gin.Context) {
			contentType := c.Request.Header.Get("Content-Type")
			if c.Request.Method != "POST" && contentType != "application/json" {
				// 如果以assets开头的请求转发
				if len(c.Request.URL.Path) > 7 && c.Request.URL.Path[:7] == "/assets" {
					c.File("./front/assets" + c.Request.URL.Path[7:])
					return
				}
				if c.Request.URL.Path == "/config.json" {
					c.File("./front/config.json")
					return
				}
				c.File("./front/index.html")
			} else {
				c.Next()
			}
		})
	}
	InitAdminRoot(engine)
	InitSvrRoot(engine)
	s1v, err1 := GStorage.Get("WebSalt1")
	s2v, err2 := GStorage.Get("WebSalt2")
	var s1, s2 string
	if err1 != nil || err2 != nil || s1v == nil || s2v == nil {
		_ = misc.Input("input web salt1:", 10, &s1)
		_ = misc.Input("input web salt2:", 10, &s2)
		if s1 == "" || s2 == "" {
			panic("salt1 or salt2 is empty")
		}
		_ = GStorage.Set("WebSalt1", xstorage.ToUnit[string](s1, xstorage.ValueTypeString))
		_ = GStorage.Set("WebSalt2", xstorage.ToUnit[string](s2, xstorage.ValueTypeString))
	}
	m.Jwt.SetSalt(xstorage.ToBase[string](s1v), xstorage.ToBase[string](s2v))
	err := engine.Run(":" + GBaseSetting.Copy().WebPort)
	if err != nil {
		panic(err)
	}
}

func (m *WebMgr) CheckSignature(data *token.Data, wantPermission string) bool {
	n := time.Now()
	return m.Jwt.CheckSignature(data, n, wantPermission)
}
