package task

import (
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/tool"
	"time"

	"github.com/intmian/platform/mian_go_lib/tool/xlog"
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
	setting.GSettingMgr.Set(u.name+".open", true)
	setting.GSettingMgr.Save()
	u.c = cron.New()
	err := u.c.AddFunc(u.timeStr, u.do)
	if err != nil {
		tool.GLog.Log(xlog.EError, u.name, "start失败:"+err.Error())
	}
	u.c.Start()
	u.status = StatusPending
}

func (u *Unit) Stop() {
	if u.status == StatusClose {
		return
	}
	setting.GSettingMgr.Set(u.name+".open", false)
	setting.GSettingMgr.Save()
	u.c.Stop()
	u.status = StatusClose
}

func (u *Unit) Status() Status {
	return u.status
}

func (u *Unit) do() {
	u.status = StatusRunning
	tool.GLog.Log(xlog.ELog, u.name, "执行开始")
	ok := make(chan bool)
	begin := time.Now()
	go func() {
		defer func() {
			if err := recover(); err != nil {
				tool.GLog.Log(xlog.EError, u.name, "携程崩溃:"+u.name)
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
			tool.GLog.Log(xlog.EWarning, u.name, "执行超时:"+now.Sub(begin).String())
		}
	}
	tool.GLog.Log(xlog.ELog, u.name, "执行完成")
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
	t := setting.GSettingMgr.Get(u.name + ".time_str")
	if t != nil {
		switch t.(type) {
		case string:
			u.timeStr = t.(string)
		}
	}
	setting.GSettingMgr.Set(u.name+".time_str", u.timeStr)
	return &u
}

func (u *Unit) Init() {
	u.init()
	if !setting.GSettingMgr.Exist(u.name + ".open") {
		setting.GSettingMgr.Set(u.name+".open", true)
		setting.GSettingMgr.Save()
		u.Start()
	} else {
		if setting.GSettingMgr.Get(u.name + ".open").(bool) {
			u.Start()
		} else {
			u.Stop()
		}
	}
}

func (u *Unit) check() {
	i := setting.GSettingMgr.Get(u.name + ".open")
	if i != nil {
		switch i.(type) {
		case bool:
			if i.(bool) {
				u.Start()
			} else {
				u.Stop()
			}
		}
	}

	i = setting.GSettingMgr.Get(u.name + ".time_str")
	if i != nil {
		switch i.(type) {
		case string:
			u.timeStr = i.(string)
			u.c.Stop()
			u.c.Start()
		}
	}
}
