package share

import (
	"context"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xstorage"
)

// ServiceShare 服务共享的资源
// 例如配置、日志、推送、存储等等
type ServiceShare struct {
	Log     *xlog.XLog         // 共用的日志服务
	Push    *xpush.XPush       // 共用的推送服务
	Storage *xstorage.XStorage // 共用的存储服务，如果有自己私有的数据，在用户内部自己起一个
	Ctx     context.Context
}

type IService interface {
	Start(share ServiceShare) error
	Stop() error
	RegisterWeb(gin *gin.Engine)
	DeregisterWeb(gin *gin.Engine)
}
