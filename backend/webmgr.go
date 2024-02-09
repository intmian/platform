package backend

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/global"
	"io"
	"os"
	"time"
)

// GWebMgr web管理器,负责管理gin以及控制台相关，服务的鉴权与内容请从services中处理
var GWebMgr WebMgr

type WebMgr struct {
	p   xstorage.WebPack
	jwt token.JwtMgr
}

func (m *WebMgr) Init() {
	v, err := global.GStorage.Get("IsOpenWebDebug")
	if err == nil && xstorage.ToBase[bool](v) {
		gin.SetMode(gin.ReleaseMode)
		gin.DisableConsoleColor()
		// TODO: 后续改成根据日期作区分的机制
		f, _ := os.Create("gin.log")
		gin.DefaultWriter = io.MultiWriter(f)
	}
	engine := gin.Default()
	InitRoot(engine)
	s, _ := global.GStorage.GetAndSetDefault("WebPort", xstorage.ToUnit[string]("8080", xstorage.ValueTypeString))
	s1v, err1 := global.GStorage.Get("WebSalt1")
	s2v, err2 := global.GStorage.Get("WebSalt2")
	var s1, s2 string
	if err1 != nil || err2 != nil || s1v == nil || s2v == nil {
		_ = misc.Input("input web salt1", 10, &s1)
		_ = misc.Input("input web salt2", 10, &s2)
		if s1 == "" || s2 == "" {
			panic("salt1 or salt2 is empty")
		}
	}
	m.jwt.SetSalt(xstorage.ToBase[string](s1v), xstorage.ToBase[string](s2v))
	err = engine.Run(":" + xstorage.ToBase[string](s))
	if err != nil {
		panic(err)
	}
}

func (m *WebMgr) checkSignature(data *token.Data, wantPermission string) bool {
	n := time.Now()
	return m.jwt.CheckSignature(data, n, wantPermission)
}
