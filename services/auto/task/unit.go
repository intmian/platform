package task

import (
	"fmt"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/tool"
	"time"

	"github.com/intmian/mian_go_lib/xlog"
	"github.com/robfig/cron"
)

type Status int

const (
	StatusClose Status = iota
	StatusRunning
	StatusPending
)

func status2str(status Status) string {
	switch status {
	case StatusClose:
		return "关闭"
	case StatusRunning:
		return "运行"
	case StatusPending:
		return "等待"
	default:
		return "未知"
	}
}

type Task interface {
	Init()
	Do()
	GetName() string
	GetInitTimeStr() string
}

type Unit struct {
	c       *cron.Cron
	timeStr string
	status  Status
	name    string
	f       func()
	init    func()
}

func (u *Unit) Start() {
	if u.status != StatusClose {
		return
	}
	err := setting.GSetting.Set(u.name+".open", xstorage.ToUnit(true, xstorage.ValueTypeBool))
	if err != nil {
		tool.GLog.Error(u.name, "start失败:"+err.Error())
		return
	}
	u.c = cron.New()
	err = u.c.AddFunc(u.timeStr, u.do)
	if err != nil {
		tool.GLog.Error(u.name, "start失败:"+err.Error())
	}
	u.c.Start()
	u.status = StatusPending
}

func (u *Unit) Stop() {
	if u.status == StatusClose {
		return
	}
	err := setting.GSetting.Set(u.name+".open", xstorage.ToUnit(false, xstorage.ValueTypeBool))
	if err != nil {
		tool.GLog.Error(u.name, "stop失败:"+err.Error())
		return
	}
	u.c.Stop()
	u.status = StatusClose
}

func (u *Unit) Status() Status {
	return u.status
}

func (u *Unit) do() {
	u.status = StatusRunning
	tool.GLog.Info(u.name, "执行开始")
	ok := make(chan bool)
	begin := time.Now()
	go func() {
		defer func() {
			if err := recover(); err != nil {
				tool.GLog.Error(u.name, "携程崩溃:"+u.name)
			}
		}()
		u.f()
		ok <- true
	}()
loop:
	for {
		select {
		case <-ok:
			break loop
		case <-time.After(time.Hour):
			now := time.Now()
			tool.GLog.Warning(u.name, "执行超时:"+now.Sub(begin).String())
		}
	}
	tool.GLog.Info(u.name, "执行完成")
	u.status = StatusPending

}

func (u *Unit) GetNextTime() string {
	if u.c == nil {
		return ""
	}
	if u.status == StatusClose {
		return ""
	}
	return u.c.Entries()[0].Next.Format("2006-01-02 15:04:05")
}

func (u *Unit) GetNextRemain() string {
	if u.c == nil {
		return ""
	}
	if u.status == StatusClose {
		return ""
	}
	return u.c.Entries()[0].Next.Sub(time.Now()).String()
}

func NewUnit(task Task) *Unit {
	u := Unit{
		timeStr: task.GetInitTimeStr(),
		name:    task.GetName(),
		f:       task.Do,
		init:    task.Init,
	}
	//t := setting.GSetting.Get(u.name + ".time_str")
	//if t != nil {
	//	switch t.(type) {
	//	case string:
	//		u.timeStr = t.(string)
	//	}
	//}
	//setting.GSetting.Set(u.name+".time_str", u.timeStr)
	var v xstorage.ValueUnit
	ok, err, c := setting.GSetting.GetAndSetDefaultAsync(u.name+".time_str", xstorage.ToUnit(u.timeStr, xstorage.ValueTypeString), &v)
	if err != nil {
		tool.GLog.Error(u.name, fmt.Sprintf("NewUnit(%v) GetAndSetDefaultAsync error:%v", task, err))
		return nil
	}
	if ok {
		u.timeStr = xstorage.ToBase[string](&v)
	}
	xlog.GoWaitError(tool.GLog, c, u.name, fmt.Sprintf("NewUnit(%v) GetAndSetDefaultAsync error", task))
	return &u
}

func (u *Unit) Init() {
	u.init()
	//if !setting.GSetting.Exist(u.name + ".open") {
	//	setting.GSetting.Set(u.name+".open", true)
	//	setting.GSetting.Save()
	//	u.Start()
	//} else {
	//	if setting.GSetting.Get(u.name + ".open").(bool) {
	//		u.Start()
	//	} else {
	//		u.Stop()
	//	}
	//}
	v := &xstorage.ValueUnit{}
	ok, err, c := setting.GSetting.GetAndSetDefaultAsync(u.name+".open", xstorage.ToUnit(true, xstorage.ValueTypeBool), v)
	if err != nil {
		tool.GLog.Error(u.name, fmt.Sprintf("Unit.Init() GetAndSetDefaultAsync error:%v", err))
		return
	}
	if !ok {
		u.Start()
	} else {
		if xstorage.ToBase[bool](v) {
			u.Start()
		} else {
			u.Stop()
		}
	}
	xlog.GoWaitError(tool.GLog, c, u.name, "Unit.Init() GetAndSetDefaultAsync error")
}

func (u *Unit) check() {
	//i := setting.GSetting.Get(u.name + ".open")
	//if i != nil {
	//	switch i.(type) {
	//	case bool:
	//		if i.(bool) {
	//			u.Start()
	//		} else {
	//			u.Stop()
	//		}
	//	}
	//}
	//
	//i = setting.GSetting.Get(u.name + ".time_str")
	//if i != nil {
	//	switch i.(type) {
	//	case string:
	//		u.timeStr = i.(string)
	//		u.c.Stop()
	//		u.c.Start()
	//	}
	//}
	get, b, err := xstorage.Get[bool](setting.GSetting, u.name+".open")
	if err != nil {
		tool.GLog.Error(u.name, fmt.Sprintf("Unit.check() Get error:%v", err))
	}
	if get {
		if b {
			u.Start()
		} else {
			u.Stop()
		}
	}
	get, s, err := xstorage.Get[string](setting.GSetting, u.name+".time_str")
	if err != nil {
		tool.GLog.Error(u.name, fmt.Sprintf("Unit.check() Get error:%v", err))
	}
	if get {
		if s != u.timeStr {
			u.timeStr = s
			u.c.Stop()
			u.c.Start()
		}
	}
}
