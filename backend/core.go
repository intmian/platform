package backend

import (
	"context"
	"fmt"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/global"
	coreShare "github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/backend/tool"
	"github.com/intmian/platform/services/auto"
	"github.com/intmian/platform/services/share"
	"github.com/pkg/errors"
	"time"
)

var GPlatCore *PlatCore

// PlatCore 提供共用的核心共享服务，并负责启动关闭各项服务
// TODO:后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务，同时考虑在服务间转发等等，现在就是一个单机单进程系统。接入netext后就行，将信息在core内接通，然后在core内部转发
type PlatCore struct {
	ctx         context.Context
	startTime   time.Time
	service     map[coreShare.SvrFlag]share.IService
	serviceMeta map[coreShare.SvrFlag]*coreShare.ServiceMeta
}

func (p *PlatCore) Init() error {
	p.ctx = context.WithoutCancel(global.GCtx)
	p.service = make(map[coreShare.SvrFlag]share.IService)
	p.serviceMeta = make(map[coreShare.SvrFlag]*coreShare.ServiceMeta)
	p.startTime = time.Now()
	p.registerSvr()
	err := global.GPush.Push("PLAT", "初始化完成", false)
	if err != nil {
		global.GLog.WarningErr("PLAT", errors.WithMessage(err, "push Init err"))
	}
	global.GLog.Info("PLAT", "初始化完成")
	return nil
}

func (p *PlatCore) Update() {
	<-p.ctx.Done()
}

func (p *PlatCore) StartService(flag coreShare.SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
	err := global.GStorage.Set(xstorage.Join(string(name), "open"), v)
	if err != nil {
		global.GLog.ErrorErr("PLAT", errors.WithMessagef(err, "StartService %d err", flag))
	}
	if _, ok := p.service[flag]; !ok {
		return errors.New("service not exist")
	}
	err = p.service[flag].Start(share.ServiceShare{
		Log:     global.GLog,
		Push:    global.GPush,
		Storage: global.GStorage,
		Ctx:     context.WithoutCancel(p.ctx),
	})
	p.service[flag].RegisterWeb(GWebMgr.webEngine)
	if err != nil {
		global.GLog.ErrorErr("PLAT", errors.WithMessagef(err, "StartService %d err", flag))
	}
	err = global.GPush.Push("PLAT", fmt.Sprintf("服务 %s 成功启动", name), false)
	p.serviceMeta[flag].Status = coreShare.StatusStart
	p.serviceMeta[flag].StartTime = time.Now()
	if err != nil {
		global.GLog.WarningErr("PLAT", errors.WithMessage(err, "StartService push err"))
	}
	global.GLog.Info("PLAT", fmt.Sprintf("服务 %s 成功启动", name))
	return nil
}

func (p *PlatCore) StopService(flag coreShare.SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](false, xstorage.ValueTypeBool)
	err := global.GStorage.Set(xstorage.Join(string(name), "open"), v)
	if err != nil {
		global.GLog.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	if _, ok := p.service[flag]; !ok {
		return errors.New("service not exist")
	}
	svr := p.service[flag]
	err = svr.Stop()
	svr.DeregisterWeb(GWebMgr.webEngine)
	p.serviceMeta[flag].StartTime = time.Now()
	p.serviceMeta[flag].Status = coreShare.StatusStop
	if err != nil {
		global.GLog.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	err = global.GPush.Push("PLAT", fmt.Sprintf("服务 %s 成功停止", name), false)
	if err != nil {
		global.GLog.WarningErr("PLAT", errors.WithMessage(err, "StopService push err"))
	}
	global.GLog.Info("PLAT", fmt.Sprintf("服务 %s 成功停止", name))
	return nil
}

func (p *PlatCore) registerSvr() {
	p.service[coreShare.FlagAuto] = &auto.Service{}
	// 新增于此处
	for k, _ := range p.service {
		p.serviceMeta[k] = &coreShare.ServiceMeta{}
		u := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
		openV, err := global.GStorage.GetAndSetDefault(xstorage.Join(string(coreShare.NameAuto), "open"), u)
		if err != nil {
			global.GLog.ErrorErr("PLAT", errors.WithMessagef(err, "registerSvr get %s open err", coreShare.NameAuto))
			continue
		}
		if openV == nil || !xstorage.ToBase[bool](openV) {
			continue
		}
		err = p.StartService(k)
		if err != nil {
			global.GLog.ErrorErr("PLAT", errors.WithMessage(err, "registerSvr start err"))
		}
	}
}

func (p *PlatCore) GetServiceMeta(flag coreShare.SvrFlag) *coreShare.ServiceMeta {
	return p.serviceMeta[flag]
}

func (p *PlatCore) GetWebInfo() []coreShare.ServicesInfo {
	var ret []coreShare.ServicesInfo
	ret = append(ret, coreShare.ServicesInfo{
		Name:      "core",
		Status:    tool.GetStatusStr(coreShare.StatusStart),
		StartTime: p.startTime.Format("2006-01-02 15:04:05"),
	})
	for k, v := range p.serviceMeta {
		ret = append(ret, coreShare.ServicesInfo{
			Name:   string(tool.GetName(k)),
			Status: tool.GetStatusStr(v.Status),
			// 到秒数为止
			StartTime: v.StartTime.Format("2006-01-02 15:04:05"),
		})
	}
	return ret
}

func (p *PlatCore) GetStartTime() time.Time {
	return p.startTime
}
