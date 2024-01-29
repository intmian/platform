package share

import (
	"context"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xstorage"
)

// ServiceShare 服务共享的资源
// 例如配置、日志、推送、存储等等
type ServiceShare struct {
	Log         *xlog.XLog         // 共用的日志服务
	Push        *xpush.XPush       // 共用的推送服务
	Storage     *xstorage.XStorage // 共用的存储服务，如果有自己私有的数据，在用户内部自己起一个
	PlatSetting *xstorage.XStorage // 平台配置服务。不是每一个服务都需要
	// 日后如果有服务发现和共享配置的在这里配一下，现在先不管
}

type ServiceBase struct {
	ctx *context.Context
}

type Service interface {
	Start(share ServiceShare) error
	Stop() error
}
