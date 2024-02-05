package web

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/xstorage"
)

var GWebMgr Mgr

func Init() {
	GWebMgr.Init()
}

type Mgr struct {
	p xstorage.WebPack
}

func (m *Mgr) Init() {
	engine := gin.Default()
	InitRoot(engine)
}
