package mgr

import (
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/tool/xstorage"
	"github.com/intmian/platform/services/auto"
	"github.com/intmian/platform/services/share"
)

// Mgr 提供共用的核心构建，并负责启动关闭各项服务
// TODO:后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务，同时考虑在服务间转发等等，现在就是一个单机单进程系统
type Mgr struct {
	log         *xlog.Mgr
	push        *xpush.XPush
	storage     *xstorage.Mgr

	baseSetting baseSetting
	misc.TJsonTool

	service     map[SvrFlag]Service
}

func (m *Mgr) Init() {
	m.push = xpush.NewDingMgr(,m.baseSetting.PlatName)
}

func (m *Mgr) registerSvr(svr share.Service) {
	m.service = map[SvrFlag]Service{}
	m.service[FLAG_AUTO] = Service{
		name: AutoName,
		svr:  auto.Service{},
	}
}
