package platform

import (
	"context"
	"fmt"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/account"
	"github.com/intmian/platform/backend/services/auto"
	"github.com/intmian/platform/backend/services/cmd"
	coreShare "github.com/intmian/platform/backend/share"
	"github.com/pkg/errors"
	"time"
)

// core 提供共用的核心共享服务，并负责启动关闭各项服务
// 向外部提供接口，允许部分参与服务业务
// TODO:后续可以考虑多机，一个服务一个进程起多个或者一个进程n个，网关服务，同时考虑在服务间转发等等，现在就是一个单机单进程系统。接入netext后就行，将信息在core内接通，然后在core内部转发
type core struct {
	ctx         context.Context
	startTime   time.Time
	service     map[coreShare.SvrFlag]coreShare.IService
	serviceMeta map[coreShare.SvrFlag]*coreShare.ServiceMeta
	plat        *PlatForm
}

func (c *core) Init(plat *PlatForm) error {
	if plat == nil {
		return errors.New("plat is nil")
	}
	c.plat = plat
	c.ctx = context.WithoutCancel(c.plat.ctx)
	c.service = make(map[coreShare.SvrFlag]coreShare.IService)
	c.serviceMeta = make(map[coreShare.SvrFlag]*coreShare.ServiceMeta)
	c.startTime = time.Now()
	c.registerSvr()
	err := c.plat.push.Push("PLAT", "初始化完成", false)
	if err != nil {
		c.plat.log.WarningErr("PLAT", errors.WithMessage(err, "push Init err"))
	}
	c.plat.log.Info("PLAT", "初始化完成")
	return nil
}

func (c *core) Update() {
	<-c.ctx.Done()
}

func (c *core) startService(flag coreShare.SvrFlag) error {
	name := c.plat.getName(flag)
	//v := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
	//err := c.plat.Lobal.c.plat.storage.Set(xstorage.Join(string(name), "open"), v)
	//if err != nil {
	//	c.plat.Lobal.c.plat.log.ErrorErr("PLAT", errors.WithMessagef(err, "startService %d err", flag))
	//}
	if _, ok := c.service[flag]; !ok {
		return errors.New("service not exist")
	}
	err := c.service[flag].Start(coreShare.ServiceShare{
		Log:     c.plat.log,
		Push:    c.plat.push,
		Storage: c.plat.storage,
		CallOther: func(to coreShare.SvrFlag, msg coreShare.Msg) {
			c.onRec(to, msg, coreShare.Valid{FromSys: true})
		},
		CallOtherRpc: func(to coreShare.SvrFlag, msg coreShare.Msg) (interface{}, error) {
			return c.onRecRpc(to, msg, coreShare.Valid{FromSys: true})
		},
		BaseSetting: c.plat.baseSetting.Copy(),
		Ctx:         context.WithoutCancel(c.ctx),
	})
	if err != nil {
		c.plat.log.ErrorErr("PLAT", errors.WithMessagef(err, "startService %d err", flag))
	}
	err = c.plat.push.Push("PLAT", fmt.Sprintf("服务 %s 成功启动", name), false)
	c.serviceMeta[flag].Status = coreShare.StatusStart
	c.serviceMeta[flag].StartTime = time.Now()
	if err != nil {
		c.plat.log.WarningErr("PLAT", errors.WithMessage(err, "startService push err"))
	}
	c.plat.log.Info("PLAT", fmt.Sprintf("服务 %s 成功启动", name))
	return nil
}

func (c *core) stopService(flag coreShare.SvrFlag) error {
	name := c.plat.getName(flag)
	//v := xstorage.ToUnit[bool](false, xstorage.ValueTypeBool)
	//err := c.plat.Lobal.c.plat.storage.Set(xstorage.Join(string(name), "open"), v)
	//if err != nil {
	//	c.plat.Lobal.c.plat.log.ErrorErr("PLAT", errors.WithMessagef(err, "stopService %s err", name))
	//}
	if _, ok := c.service[flag]; !ok {
		return errors.New("service not exist")
	}
	svr := c.service[flag]
	if misc.HasProperty(svr.GetProp(), coreShare.SvrPropCore) || misc.HasProperty(svr.GetProp(), coreShare.SvrPropCoreOptional) {
		return errors.New("can't stop core service")
	}
	err := svr.Stop()
	c.serviceMeta[flag].StartTime = time.Now()
	c.serviceMeta[flag].Status = coreShare.StatusStop
	if err != nil {
		c.plat.log.ErrorErr("PLAT", errors.WithMessagef(err, "stopService %s err", name))
	}
	err = c.plat.push.Push("PLAT", fmt.Sprintf("服务 %s 成功停止", name), false)
	if err != nil {
		c.plat.log.WarningErr("PLAT", errors.WithMessage(err, "stopService push err"))
	}
	c.plat.log.Info("PLAT", fmt.Sprintf("服务 %s 成功停止", name))
	return nil
}

func (c *core) registerSvr() {
	c.service[coreShare.FlagAuto] = &auto.Service{}
	c.service[coreShare.FlagAccount] = &account.Service{}
	c.service[coreShare.FlagCmd] = &cmd.Service{}
	// 新增于此处
	for k, _ := range c.service {
		c.serviceMeta[k] = &coreShare.ServiceMeta{}
		u := xstorage.ToUnit[bool](true, xstorage.ValueTypeBool)
		openV, err := c.plat.storage.GetAndSetDefault(xstorage.Join(string(coreShare.NameAuto), "open_when_start"), u)
		if err != nil {
			c.plat.log.ErrorErr("PLAT", errors.WithMessagef(err, "registerSvr get %s open err", coreShare.NameAuto))
			continue
		}
		if openV == nil || !xstorage.ToBase[bool](openV) {
			continue
		}
		err = c.startService(k)
		if err != nil {
			c.plat.log.ErrorErr("PLAT", errors.WithMessage(err, "registerSvr start err"))
		}
	}
}

func (c *core) getServiceMeta(flag coreShare.SvrFlag) *coreShare.ServiceMeta {
	return c.serviceMeta[flag]
}

func (c *core) getWebInfo() []coreShare.ServicesInfo {
	var ret []coreShare.ServicesInfo
	ret = append(ret, coreShare.ServicesInfo{
		Name:      "core",
		Status:    getStatusStr(coreShare.StatusStart),
		StartTime: c.startTime.Format("2006-01-02 15:04:05"),
		Props:     int(misc.CreateProperty(coreShare.SvrPropCore)),
	})
	for k, v := range c.serviceMeta {
		service := c.service[k]
		if service != nil {
			ret = append(ret, coreShare.ServicesInfo{
				Name:      string(c.plat.getName(k)),
				Status:    getStatusStr(v.Status),
				StartTime: v.StartTime.Format("2006-01-02 15:04:05"),
				Props:     int(service.GetProp()),
			})
		}
	}
	return ret
}

func (c *core) getStartTime() time.Time {
	return c.startTime
}

func (c *core) onRecRpc(flag coreShare.SvrFlag, msg coreShare.Msg, valid coreShare.Valid) (interface{}, error) {
	rpc, err := c.service[flag].HandleRpc(msg, valid)
	if err != nil {
		return nil, err
	}
	return rpc, nil
}

func (c *core) sendAndRec(flag coreShare.SvrFlag, msg coreShare.Msg, valid coreShare.Valid) (interface{}, error) {
	return c.onRecRpc(flag, msg, valid)
}

func (c *core) onRec(flag coreShare.SvrFlag, msg coreShare.Msg, valid coreShare.Valid) {
	go c.service[flag].Handle(msg, valid)
}
