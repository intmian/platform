package platform

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/mian_go_lib/xstorage"
	"io"
	"os"
	"time"
)

// webMgr web管理器,负责管理gin以及控制台相关，服务的鉴权与内容请从services中处理
type webMgr struct {
	platStoWebPack xstorage.WebPack
	jwt            token.JwtMgr
	webEngine      *gin.Engine
	plat           *PlatForm
}

func (m *webMgr) Init(plat *PlatForm) error {
	if plat == nil {
		return errors.New("plat is nil")
	}
	m.plat = plat
	if !m.plat.baseSetting.Copy().GinDebug {
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
		xstorage.ToBaseF[bool](global.m.plat.storage.Get("UseFront"))
	*/
	if misc.PathExist("./front") && m.plat.baseSetting.Copy().UseFront {
		m.plat.log.Info("web", "接入前端")
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
	m.initAdminRoot(engine)
	m.initSvrRoot(engine)
	s1v, err1 := m.plat.storage.Get("WebSalt1")
	var s1 string
	if err1 != nil || s1v == nil {
		_ = misc.Input("input web salt1:", 10, &s1)
		if s1 == "" {
			panic("salt1 or salt2 is empty")
		}
		_ = m.plat.storage.Set("WebSalt1", xstorage.ToUnit[string](s1, xstorage.ValueTypeString))
	}
	timeStr := time.Now().Format("2006-01-02 15:04:05")
	m.jwt.SetSalt(xstorage.ToBase[string](s1v), timeStr)
	err := engine.Run(":" + m.plat.baseSetting.Copy().WebPort)
	if err != nil {
		return errors.Join(errors.New("engine run err"), err)
	}
	return nil
}

func (m *webMgr) CheckSignature(data *token.Data, wantPermission string) bool {
	n := time.Now()
	return m.jwt.CheckSignature(data, n, wantPermission)
}
