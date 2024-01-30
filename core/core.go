package core

import (
	"context"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xpush/pushmod"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/core/tool"
	"github.com/intmian/platform/services/auto"
	"github.com/intmian/platform/services/share"
	"github.com/pkg/errors"
)

// PlatCore 提供共用的核心共享服务，并负责启动关闭各项服务
// TODO:后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务，同时考虑在服务间转发等等，现在就是一个单机单进程系统
type PlatCore struct {
	log         *xlog.XLog
	push        *xpush.XPush
	storage     *xstorage.XStorage
	platStorage *xstorage.XStorage
	baseSetting *misc.FileUnit[baseSetting]

	ctx context.Context

	service map[SvrFlag]share.Service
}

func (m *PlatCore) Init() error {
	m.ctx = context.Background()
	m.baseSetting = misc.NewFileUnit[baseSetting](misc.FileUnitToml, "base_setting.toml")
	s := m.baseSetting.Copy()
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
		Ctx:               context.WithoutCancel(m.ctx),
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
	m.storage = storage
	m.push = push
	m.log = log
	m.service = make(map[SvrFlag]share.Service)
	m.registerSvr()
	return nil
}

func (m *PlatCore) StartService(flag SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
	err := m.platStorage.Set(xstorage.Join(string(name), "open"), v)
	if err != nil {
		m.log.ErrorErr("PLAT", errors.WithMessagef(err, "StartService %d err", flag))
	}
	if _, ok := m.service[flag]; !ok {
		return errors.New("service not exist")
	}
	svr := m.service[flag]
	err = svr.Start(share.ServiceShare{
		Log:     m.log,
		Push:    m.push,
		Storage: m.storage,
		Ctx:     context.WithoutCancel(m.ctx),
	})
	if err != nil {
		m.log.ErrorErr("PLAT", errors.WithMessagef(err, "StartService %d err", flag))
	}
	m.log.Info("PLAT", "StartService %s success", name)
	return nil
}

func (m *PlatCore) StopService(flag SvrFlag) error {
	name := tool.GetName(flag)
	v := xstorage.ToUnit[bool](false, xstorage.ValueTypeBool)
	err := m.platStorage.Set(xstorage.Join(string(name), "open"), v)
	if err != nil {
		m.log.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	if _, ok := m.service[flag]; !ok {
		return errors.New("service not exist")
	}
	svr := m.service[flag]
	err = svr.Stop()
	if err != nil {
		m.log.ErrorErr("PLAT", errors.WithMessagef(err, "StopService %s err", name))
	}
	m.log.Info("PLAT", "StopService %s success", name)
	return nil
}

func (m *PlatCore) registerSvr() {
	m.service[FlagAuto] = auto.Service{}
	// 新增于此处
	for _, v := range m.service {
		exist, open, err := xstorage.Get[bool](m.platStorage, xstorage.Join(string(NameAuto), "open"))
		if err != nil {
			m.log.ErrorErr("PLAT", errors.WithMessagef(err, "registerSvr get %s open err", NameAuto))
			continue
		}
		if !exist || !open {
			continue
		}

		err = v.Start(share.ServiceShare{
			Log:     m.log,
			Push:    m.push,
			Storage: m.storage,
			Ctx:     context.WithoutCancel(m.ctx),
		})
		if err != nil {
			m.log.ErrorErr("PLAT", errors.WithMessage(err, "registerSvr start err"))
		}
	}
}
