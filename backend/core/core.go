package core

import (
	"context"
	"fmt"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/account"
	"github.com/intmian/platform/backend/services/auto"
	"github.com/intmian/platform/backend/services/share"
	coreShare "github.com/intmian/platform/backend/share"
	"github.com/pkg/errors"
	"time"
)

// PlatCore 提供共用的核心共享服务，并负责启动关闭各项服务
// 向外部提供接口，允许部分参与服务业务
// TODO:后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务，同时考虑在服务间转发等等，现在就是一个单机单进程系统。接入netext后就行，将信息在core内接通，然后在core内部转发
type PlatCore struct {
	ctx         context.Context
	startTime   time.Time
	service     map[coreShare.SvrFlag]share.IService
	serviceMeta map[coreShare.SvrFlag]*coreShare.ServiceMeta
}

func (p *PlatCore) Init() error {
	p.ctx = context.WithoutCancel(gCtx)
	p.service = make(map[coreShare.SvrFlag]share.IService)
	p.serviceMeta = make(map[coreShare.SvrFlag]*coreShare.ServiceMeta)
	p.startTime = time.Now()
	p.registerSvr()
	err := gPush.Push("PLAT", "初始化完成", false)
	if err != nil {
		gLog.WarningErr("PLAT", errors.WithMessage(err, "push Init err"))
	}
	gLog.Info("PLAT", "初始化完成")
	return nil
}

func (p *PlatCore) Update() {
	<-p.ctx.Done()
}

func (p *PlatCore) startService(flag coreShare.SvrFlag) error {
	name := getName(flag)
	//v := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
	//err := global.gStorage.Set(xstorage.Join(string(name), "open"), v)
	//if err != nil {
	//	global.gLog.ErrorErr("PLAT", errors.WithMessagef(err, "startService %d err", flag))
	//}
	if _, ok := p.service[flag]; !ok {
		return errors.New("service not exist")
	}
	err := p.service[flag].Start(share.ServiceShare{
		Log:     gLog,
		Push:    gPush,
		Storage: gStorage,
		CallOther: func(to coreShare.SvrFlag, msg share.Msg) {
			p.onRec(to, msg, coreShare.Valid{FromSys: true})
		},
		CallOtherRpc: func(to coreShare.SvrFlag, msg share.Msg) (interface{}, error) {
			return p.onRecRpc(to, msg, coreShare.Valid{FromSys: true})
		},
		BaseSetting: gBaseSetting.Copy(),
		Ctx:         context.WithoutCancel(p.ctx),
	})
	if err != nil {
		gLog.ErrorErr("PLAT", errors.WithMessagef(err, "startService %d err", flag))
	}
	err = gPush.Push("PLAT", fmt.Sprintf("服务 %s 成功启动", name), false)
	p.serviceMeta[flag].Status = coreShare.StatusStart
	p.serviceMeta[flag].StartTime = time.Now()
	if err != nil {
		gLog.WarningErr("PLAT", errors.WithMessage(err, "startService push err"))
	}
	gLog.Info("PLAT", fmt.Sprintf("服务 %s 成功启动", name))
	return nil
}

func (p *PlatCore) stopService(flag coreShare.SvrFlag) error {
	name := getName(flag)
	//v := xstorage.ToUnit[bool](false, xstorage.ValueTypeBool)
	//err := global.gStorage.Set(xstorage.Join(string(name), "open"), v)
	//if err != nil {
	//	global.gLog.ErrorErr("PLAT", errors.WithMessagef(err, "stopService %s err", name))
	//}
	if _, ok := p.service[flag]; !ok {
		return errors.New("service not exist")
	}
	svr := p.service[flag]
	if misc.HasProperty(svr.GetProp(), share.SvrPropCore) || misc.HasProperty(svr.GetProp(), share.SvrPropCoreOptional) {
		return errors.New("can't stop core service")
	}
	err := svr.Stop()
	p.serviceMeta[flag].StartTime = time.Now()
	p.serviceMeta[flag].Status = coreShare.StatusStop
	if err != nil {
		gLog.ErrorErr("PLAT", errors.WithMessagef(err, "stopService %s err", name))
	}
	err = gPush.Push("PLAT", fmt.Sprintf("服务 %s 成功停止", name), false)
	if err != nil {
		gLog.WarningErr("PLAT", errors.WithMessage(err, "stopService push err"))
	}
	gLog.Info("PLAT", fmt.Sprintf("服务 %s 成功停止", name))
	return nil
}

func (p *PlatCore) registerSvr() {
	p.service[coreShare.FlagAuto] = &auto.Service{}
	p.service[coreShare.FlagAccount] = &account.Service{}
	// 新增于此处
	for k, _ := range p.service {
		p.serviceMeta[k] = &coreShare.ServiceMeta{}
		u := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
		openV, err := gStorage.GetAndSetDefault(xstorage.Join(string(coreShare.NameAuto), "open_when_start"), u)
		if err != nil {
			gLog.ErrorErr("PLAT", errors.WithMessagef(err, "registerSvr get %s open err", coreShare.NameAuto))
			continue
		}
		if openV == nil || !xstorage.ToBase[bool](openV) {
			continue
		}
		err = p.startService(k)
		if err != nil {
			gLog.ErrorErr("PLAT", errors.WithMessage(err, "registerSvr start err"))
		}
	}
}

func (p *PlatCore) getServiceMeta(flag coreShare.SvrFlag) *coreShare.ServiceMeta {
	return p.serviceMeta[flag]
}

func (p *PlatCore) getWebInfo() []coreShare.ServicesInfo {
	var ret []coreShare.ServicesInfo
	ret = append(ret, coreShare.ServicesInfo{
		Name:      "core",
		Status:    getStatusStr(coreShare.StatusStart),
		StartTime: p.startTime.Format("2006-01-02 15:04:05"),
		Props:     int(misc.CreateProperty(share.SvrPropCore)),
	})
	for k, v := range p.serviceMeta {
		service := p.service[k]
		if service != nil {
			ret = append(ret, coreShare.ServicesInfo{
				Name:      string(getName(k)),
				Status:    getStatusStr(v.Status),
				StartTime: v.StartTime.Format("2006-01-02 15:04:05"),
				Props:     int(service.GetProp()),
			})
		}
	}
	return ret
}

func (p *PlatCore) getStartTime() time.Time {
	return p.startTime
}

func (p *PlatCore) onRecRpc(flag coreShare.SvrFlag, msg share.Msg, valid coreShare.Valid) (interface{}, error) {
	rpc, err := p.service[flag].HandleRpc(msg, valid)
	if err != nil {
		return nil, err
	}
	return rpc, nil
}

func (p *PlatCore) sendAndRec(flag coreShare.SvrFlag, msg share.Msg, valid coreShare.Valid) (interface{}, error) {
	return p.onRecRpc(flag, msg, valid)
}

func (p *PlatCore) onRec(flag coreShare.SvrFlag, msg share.Msg, valid coreShare.Valid) {
	go p.service[flag].Handle(msg, valid)
}
