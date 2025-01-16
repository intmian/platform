package platform

import (
	"context"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xnews"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xpush/pushmod"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/share"
	"github.com/pkg/errors"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"
)

type PlatForm struct {
	// 工具
	ctx         context.Context
	log         *xlog.XLog
	push        *xpush.XPush
	storage     *xstorage.XStorage
	stoWebPack  *xstorage.WebPack
	news        *xnews.XNews // 用来保存最近的日志 方便查询
	baseSetting *misc.FileUnit[share.BaseSetting]
	cfg         *xstorage.CfgExt
	tool        tool

	// 子模块
	webMgr webMgr
	core   core

	// 内部状态
	startTime int64
}

func (p *PlatForm) Init(c context.Context) error {
	p.ctx = c
	if !misc.PathExist("base_setting.toml") {
		return errors.New("base_setting.toml not exist")
	}
	p.baseSetting = misc.NewFileUnit[share.BaseSetting](misc.FileUnitToml, "base_setting.toml")
	err := p.baseSetting.Load()
	if err != nil {
		return errors.WithMessage(err, "Init baseSetting err")
	}
	s := p.baseSetting.Copy()
	storage, err := xstorage.NewXStorage(xstorage.XStorageSetting{
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
	p.news, err = xnews.NewXNews(context.WithoutCancel(p.ctx))
	if err != nil {
		return errors.WithMessage(err, "Init xnews err")
	}
	var topicSetting xnews.TopicSetting
	topicSetting.AddForeverLimit(100)
	err = p.news.AddTopic("PLAT", topicSetting)
	if err != nil {
		return errors.WithMessage(err, "Init xnews add topic err")
	}
	logS := xlog.DefaultSetting()
	logS.LogAddr = s.LogAddr
	logS.IfPush = true
	logS.PushMgr = push
	logS.OnLog = func(content string) {
		_ = p.news.AddMessage("PLAT", content)
	}
	log, err := xlog.NewXLog(logS)
	if err != nil {
		return err
	}
	p.storage = storage
	p.stoWebPack, err = xstorage.NewWebPack(
		xstorage.WebPackSetting{
			LogFrom: "plat",
			Log:     log,
		},
		storage,
	)
	if err != nil {
		return errors.WithMessage(err, "Init WebPack err")
	}
	cfg, err := xstorage.NewCfgExt(storage)
	if err != nil {
		return errors.WithMessage(err, "Init cfg err")
	}
	p.cfg = cfg
	p.push = push
	p.log = log

	// 初始化工具
	p.tool.flag2name = make(map[share.SvrFlag]share.SvrName)
	p.tool.name2flag = make(map[share.SvrName]share.SvrFlag)
	p.tool.flag2name[share.FlagAuto] = share.NameAuto
	p.tool.flag2name[share.FlagNote] = share.NameNote
	p.tool.flag2name[share.FlagAccount] = share.NameAccount
	p.tool.flag2name[share.FlagCmd] = share.NameCmd
	// 新增服务要在这里注册
	for k, v := range p.tool.flag2name {
		p.tool.name2flag[v] = k
	}

	// 初始化子模块
	err = p.core.Init(p)
	if err != nil {
		return errors.WithMessage(err, "Init core err")
	}
	err = p.webMgr.Init(p)
	if err != nil {
		return errors.WithMessage(err, "init web err")
	}

	// 初始化一些工具状态
	p.startTime = time.Now().Unix()

	// 做下退出的警报
	sigC := make(chan os.Signal)
	signal.Notify(sigC, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigC
		p.log.Info("PLAT", "receive signal %v, exit", sig)
		err := p.push.Push("PLAT", "因外部信号，服务器已退出", false)
		if err != nil {
			p.log.WarningErr("PLAT", errors.WithMessage(err, "push exit err"))
		}
		time.Sleep(time.Second)
		os.Exit(0)
	}()

	// 初始化pprof
	go func() {
		http.ListenAndServe("127.0.0.1:12351", nil)
	}()

	// 初始化配置 TODO: 后续迁移到服务
	err = p.cfg.AddParam(&xstorage.CfgParam{
		Key:       "note.setting",
		ValueType: xstorage.ValueTypeString,
		CanUser:   false,
		RealKey:   "note.setting",
	})
	if err != nil {
		return errors.WithMessage(err, "add note.setting err")
	}

	return nil
}

func (p *PlatForm) Run() {
	p.core.Update()
}

func (p *PlatForm) getFlag(name share.SvrName) share.SvrFlag {
	return p.tool.name2flag[name]
}

func (p *PlatForm) getName(flag share.SvrFlag) share.SvrName {
	return p.tool.flag2name[flag]
}
