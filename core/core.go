package core

import (
	"context"
	"fmt"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xnews"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xpush/pushmod"
	"github.com/intmian/mian_go_lib/xstorage"
	coreShare "github.com/intmian/platform/core/share"
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
	tool.Init()
	err := GPlatCore.Init()
	if err != nil {
		panic(err)
	}
}

// PlatCore 提供共用的核心共享服务，并负责启动关闭各项服务
// TODO:后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务，同时考虑在服务间转发等等，现在就是一个单机单进程系统。接入netext后就行，将信息在core内接通，然后在core内部转发
type PlatCore struct {
	log         *xlog.XLog
	push        *xpush.XPush
	storage     *xstorage.XStorage
	WebPack     *xstorage.WebPack
	logNews     *xnews.XNews // 用来保存最近的日志 方便查询
	baseSetting *misc.FileUnit[coreShare.BaseSetting]

	ctx context.Context

	service     map[coreShare.SvrFlag]share.IService
	serviceMeta map[coreShare.SvrFlag]*coreShare.ServiceMeta
}

func (p *PlatCore) Init() error {
	p.ctx = context.Background()
	if !misc.PathExist("base_setting.toml") {
		return errors.New("base_setting.toml not exist")
	}
	p.baseSetting = misc.NewFileUnit[coreShare.BaseSetting](misc.FileUnitToml, "base_setting.toml")
	err := p.baseSetting.Load()
	if err != nil {
		return errors.WithMessage(err, "Init baseSetting err")
	}
	s := p.baseSetting.Copy()
	storage, err := xstorage.NewXStorage(xstorage.XstorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.UseDisk, xstorage.MultiSafe, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   s.DBAddr,
	})
	if err != nil {
		return errors.WithMessage(err, "Init xstorage err")
	}
	push, err := xpush.NewXPush(true)
	if err != nil {
		return errors.WithMessage(err, "Init xpush err")
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
	p.logNews, err = xnews.NewXNews(context.WithoutCancel(p.ctx))
	if err != nil {
		return errors.WithMessage(err, "Init xnews err")
	}
	var topicSetting xnews.TopicSetting
	topicSetting.AddForeverLimit(100)
	err = p.logNews.AddTopic("PLAT", topicSetting)
	if err != nil {
		return errors.WithMessage(err, "Init xnews add topic err")
	}
	logS := xlog.DefaultSetting()
	logS.LogAddr = s.LogAddr
	logS.OnLog = func(content string) {
		_ = p.logNews.AddMessage("PLAT", content)
	}
	log, err := xlog.NewXlog(logS)
	if err != nil {
		return err
	}
	p.storage = storage
	p.WebPack, err = xstorage.NewWebPack(
		xstorage.WebPackSetting{
			LogFrom: "plat",
			Log:     log,
		},
		storage,
	)
	if err != nil {
		return errors.WithMessage(err, "Init WebPack err")
	}
	p.push = push
	p.log = log
	p.service = make(map[coreShare.SvrFlag]share.IService)
	p.serviceMeta = make(map[coreShare.SvrFlag]*coreShare.ServiceMeta)
	p.registerSvr()
	return nil
}

func (p *PlatCore) Update() {
	<-p.ctx.Done()
}

func (p *PlatCore) StartService(flag coreShare.SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
	err := p.storage.Set(xstorage.Join(string(name), "open"), v)
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
	p.serviceMeta[flag].Status = coreShare.StatusStart
	p.serviceMeta[flag].StartTime = time.Now()
	if err != nil {
		p.log.WarningErr("PLAT", errors.WithMessage(err, "StartService push err"))
	}
	return nil
}

func (p *PlatCore) StopService(flag coreShare.SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](false, xstorage.ValueTypeBool)
	err := p.storage.Set(xstorage.Join(string(name), "open"), v)
	if err != nil {
		p.log.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	if _, ok := p.service[flag]; !ok {
		return errors.New("service not exist")
	}
	svr := p.service[flag]
	err = svr.Stop()
	p.serviceMeta[flag].Status = coreShare.StatusStop
	if err != nil {
		p.log.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	p.log.Info("PLAT", "StopService %s success", name)
	return nil
}

func (p *PlatCore) registerSvr() {
	p.service[coreShare.FlagAuto] = &auto.Service{}
	// 新增于此处
	for k, _ := range p.service {
		p.serviceMeta[k] = &coreShare.ServiceMeta{}
		u := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
		openV, err := p.storage.GetAndSetDefault(xstorage.Join(string(coreShare.NameAuto), "open"), u)
		if err != nil {
			p.log.ErrorErr("PLAT", errors.WithMessagef(err, "registerSvr get %s open err", coreShare.NameAuto))
			continue
		}
		if openV == nil || !xstorage.ToBase[bool](openV) {
			continue
		}
		err = p.StartService(k)
		if err != nil {
			p.log.ErrorErr("PLAT", errors.WithMessage(err, "registerSvr start err"))
		}
	}
}

func (p *PlatCore) GetServiceMeta(flag coreShare.SvrFlag) *coreShare.ServiceMeta {
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

func (p *PlatCore) GetLastLog() ([]string, error) {
	return p.logNews.GetTopic("PLAT")
}
