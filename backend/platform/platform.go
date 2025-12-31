package platform

import (
	"context"
	"fmt"
	"log"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/intmian/mian_go_lib/fork/d1_gorm_adapter/gormd1"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xbi"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xnews"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xpush/pushmod"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/backend/share/utils"
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
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
	bi          *xbi.XBi
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
		Ctx:               p.ctx,
	})
	if err != nil {
		return err
	}
	p.news, err = xnews.NewXNews(p.ctx)
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
	logS.Ctx = p.ctx
	logS.OnLog = func(content string) {
		_ = p.news.AddMessage("PLAT", content)
	}
	xLog, err := xlog.NewXLog(logS)
	if err != nil {
		return err
	}

	biS := xbi.GetDefaultSetting()
	bisErrorChan := xLog.GetLogChan("PLAT.XBI")
	biS.Ctx = p.ctx
	biS.ErrorChan = bisErrorChan
	// 考虑到日志不需要时延所以不用本地数据库
	file := utils.GetSqlLog("plat")
	//defer file.Close()
	newLogger := logger.New(
		log.New(file, "SQL: ", log.LstdFlags), // 日志输出到 sql.log 文件
		logger.Config{
			LogLevel:                  logger.Info,     // 控制日志级别，Info 会输出 SQL 语句
			SlowThreshold:             5 * time.Second, // 慢查询日志阈值
			IgnoreRecordNotFoundError: true,            // 忽略 RecordNotFound 错误
			Colorful:                  false,           // 禁用颜色输出
		})
	d1str := fmt.Sprintf("d1://%s:%s@%s", s.D1LogAccountID, s.D1LogApiToken, s.D1LogDBID)
	db, err := gorm.Open(gormd1.Open(d1str), &gorm.Config{
		Logger: newLogger,
	})
	if err != nil {
		return errors.WithMessage(err, "Init xlog error err")
	}
	biS.Db = db
	xBi, err := xbi.NewXBi(biS)
	if err != nil {
		return errors.WithMessage(err, "Init xbi err")
	}
	p.bi = xBi

	p.storage = storage
	p.stoWebPack, err = xstorage.NewWebPack(
		xstorage.WebPackSetting{
			LogFrom: "plat",
			Log:     xLog,
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
	p.log = xLog

	// 初始化工具
	p.tool.flag2name = make(map[share.SvrFlag]share.SvrName)
	p.tool.name2flag = make(map[share.SvrName]share.SvrFlag)
	p.tool.flag2name[share.FlagAuto] = share.NameAuto
	p.tool.flag2name[share.FlagNote] = share.NameNote
	p.tool.flag2name[share.FlagAccount] = share.NameAccount
	p.tool.flag2name[share.FlagCmd] = share.NameCmd
	p.tool.flag2name[share.FlagTodone] = share.NameTodone
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
	err = p.InitCfg()
	if err != nil {
		return errors.WithMessage(err, "InitCfg err")
	}

	return nil
}

func (p *PlatForm) InitCfg() error {
	params := []*xstorage.CfgParam{
		// 新配置注册
		{
			Key:       "note.setting",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "note.setting",
		},
		{
			Key:       "PLAT.realUrl",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.realUrl",
		},
		{
			Key:       "PLAT.outUrl",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.outUrl",
		},
		{
			Key:       "PLAT.baseUrl",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.baseUrl",
		},
		{
			Key:       "auto.news.keys",
			ValueType: xstorage.ValueTypeSliceString,
			CanUser:   false,
			RealKey:   "auto.news.keys",
		},
		{
			Key:       "PLAT.r2.endpoint",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.r2.endpoint",
		},
		{
			Key:       "PLAT.r2.accessKey",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.r2.accessKey",
		},
		{
			Key:       "PLAT.r2.secretKey",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.r2.secretKey",
		},
		{
			Key:       "PLAT.r2.bucket",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.r2.bucket",
		},
		{
			Key:       "PLAT.r2.web",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "PLAT.r2.web",
		},
	}
	for _, v := range params {
		err := p.cfg.AddParam(v)
		if err != nil {
			return errors.WithMessage(err, "AddParam "+v.Key+" err")
		}
	}
	return nil
}

func (p *PlatForm) Run() {
	<-p.ctx.Done()
}

func (p *PlatForm) getFlag(name share.SvrName) share.SvrFlag {
	return p.tool.name2flag[name]
}

func (p *PlatForm) getName(flag share.SvrFlag) share.SvrName {
	return p.tool.flag2name[flag]
}
