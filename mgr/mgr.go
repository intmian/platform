package mgr

import (
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/mian_go_lib/tool/xpush"
	"github.com/intmian/mian_go_lib/tool/xstorage"
	"github.com/intmian/platform/services/auto"
	"github.com/intmian/platform/services/share"
)

// Mgr 提供共用的核心构建，并负责启动关闭各项服务，后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务等等，现在就是一个单机单进程系统
type Mgr struct {
	log     *xlog.Mgr
	push    *xpush.Mgr
	storage *xstorage.Mgr
	service map[SvrFlag]Service
}

func (m *Mgr) Init(svr share.Service) {
	autoS := auto.Service{}
	m.service = map[SvrFlag]Service{
		FLAG_AUTO: Service{
			name: AUTO,
			svr:  autoS,
		},
	}
}
