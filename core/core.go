package core

import (
	"context"
	"fmt"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xpush/pushmod"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/core/tool"
	"github.com/intmian/platform/services/auto"
	"github.com/intmian/platform/services/share"
	share2 "github.com/intmian/platform/web/share"
	"github.com/pkg/errors"
	"time"
)

var GPlatCore *PlatCore

func Init() {
	GPlatCore = &PlatCore{}
	err := GPlatCore.Init()
	if err != nil {
		panic(err)
	}
}

// PlatCore 提供共用的核心共享服务，并负责启动关闭各项服务
// TODO:后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务，同时考虑在服务间转发等等，现在就是一个单机单进程系统,
type PlatCore struct {
	log         *xlog.XLog
	push        *xpush.XPush
	storage     *xstorage.XStorage
	platStorage *xstorage.XStorage
	baseSetting *misc.FileUnit[baseSetting]

	ctx context.Context

	service     map[SvrFlag]share.IService
	serviceMeta map[SvrFlag]*ServiceMeta
}

func (p *PlatCore) Init() error {
	p.ctx = context.Background()
	p.baseSetting = misc.NewFileUnit[baseSetting](misc.FileUnitToml, "base_setting.toml")
	s := p.baseSetting.Copy()
	storage, err := xstorage.NewXStorage(xstorage.XstorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.UseDisk, xstorage.MultiSafe, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   s.DBAddr,
	})
	if err != nil {
		return err
	}
	push, err := xpush.NewXPush(true)
	if err != nil {
		return err
	}
	err = push.AddDingDing(pushmod.DingSetting{
		Token:             s.DingDingToken,
		Secret:            s.DingDingSecret,
		SendInterval:      60,
		IntervalSendCount: 20,
		Ctx:               context.WithoutCancel(p.ctx),
	})
	if err != nil {
		return err
	}
	logS := xlog.DefaultSetting()
	logS.LogAddr = s.LogAddr
	log, err := xlog.NewXlog(logS)
	if err != nil {
		return err
	}
	p.storage = storage
	p.push = push
	p.log = log
	p.service = make(map[SvrFlag]share.IService)
	p.serviceMeta = make(map[SvrFlag]*ServiceMeta)
	p.registerSvr()
	return nil
}

func (p *PlatCore) StartService(flag SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
	err := p.platStorage.Set(xstorage.Join(string(name), "open"), v)
	if err != nil {
		p.log.ErrorErr("PLAT", errors.WithMessagef(err, "StartService %d err", flag))
	}
	if _, ok := p.service[flag]; !ok {
		return errors.New("service not exist")
	}
	err = p.service[flag].Start(share.ServiceShare{
		Log:     p.log,
		Push:    p.push,
		Storage: p.storage,
		Ctx:     context.WithoutCancel(p.ctx),
	})
	if err != nil {
		p.log.ErrorErr("PLAT", errors.WithMessagef(err, "StartService %d err", flag))
	}
	err = p.push.Push("PLAT", fmt.Sprintf("StartService %s success", name), false)
	p.serviceMeta[flag].Status = StatusStart
	p.serviceMeta[flag].StartTime = time.Now()
	if err != nil {
		p.log.WarningErr("PLAT", errors.WithMessage(err, "StartService push err"))
	}
	return nil
}

func (p *PlatCore) StopService(flag SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](false, xstorage.ValueTypeBool)
	err := p.platStorage.Set(xstorage.Join(string(name), "open"), v)
	if err != nil {
		p.log.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	if _, ok := p.service[flag]; !ok {
		return errors.New("service not exist")
	}
	svr := p.service[flag]
	err = svr.Stop()
	p.serviceMeta[flag].Status = StatusStop
	if err != nil {
		p.log.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	p.log.Info("PLAT", "StopService %s success", name)
	return nil
}

func (p *PlatCore) registerSvr() {
	p.service[FlagAuto] = &auto.Service{}
	// 新增于此处
	for k, v := range p.service {
		p.serviceMeta[k] = &ServiceMeta{}
		openV, err := p.platStorage.Get(xstorage.Join(string(NameAuto), "open"))
		if err != nil {
			p.log.ErrorErr("PLAT", errors.WithMessagef(err, "registerSvr get %s open err", NameAuto))
			continue
		}
		if openV == nil || !xstorage.ToBase[bool](openV) {
			continue
		}

		err = v.Start(share.ServiceShare{
			Log:     p.log,
			Push:    p.push,
			Storage: p.storage,
			Ctx:     context.WithoutCancel(p.ctx),
		})
		if err != nil {
			p.log.ErrorErr("PLAT", errors.WithMessage(err, "registerSvr start err"))
		}
	}
}

func (p *PlatCore) GetServiceMeta(flag SvrFlag) *ServiceMeta {
	return p.serviceMeta[flag]
}

func (p *PlatCore) GetWebInfo() []share2.ServicesInfo {
	var ret []share2.ServicesInfo
	for k, v := range p.serviceMeta {
		ret = append(ret, share2.ServicesInfo{
			Name:      string(tool.GetName(k)),
			Status:    tool.GetStatusStr(v.Status),
			StartTime: time.Since(v.StartTime).String(),
		})
	}
	return ret
}

func (p *PlatCore) GetWebSetting() share2.Setting {
	d := xstorage.ToUnit[string]("8080", xstorage.ValueTypeString)
	port, err := p.storage.GetAndSetDefault(xstorage.Join("web", "port"), d)
	if err != nil {
		p.log.ErrorErr("PLAT", errors.WithMessage(err, "PlatCore GetWebSetting"))
		return share2.Setting{
			WebPort: "8080",
		}
	}
	return share2.Setting{
		WebPort: xstorage.ToBase[string](port),
	}
}
