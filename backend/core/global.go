package core

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
)

// 目前以单利将模块封装。因为之前拆分的太细太乱，合并后只能先这样
var gCtx = context.Background()
var gLog *xlog.XLog
var gPush *xpush.XPush
var gStorage *xstorage.XStorage
var gStoWebPack *xstorage.WebPack
var gNews *xnews.XNews // 用来保存最近的日志 方便查询
var gBaseSetting *misc.FileUnit[share.BaseSetting]
var gCfg *xstorage.CfgExt
var gWebMgr webMgr
var GPlatCore *PlatCore
var gTool tool

func Init() error {
	if !misc.PathExist("base_setting.toml") {
		return errors.New("base_setting.toml not exist")
	}
	gBaseSetting = misc.NewFileUnit[share.BaseSetting](misc.FileUnitToml, "base_setting.toml")
	err := gBaseSetting.Load()
	if err != nil {
		return errors.WithMessage(err, "Init baseSetting err")
	}
	s := gBaseSetting.Copy()
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
		Ctx:               context.WithoutCancel(gCtx),
	})
	if err != nil {
		return err
	}
	gNews, err = xnews.NewXNews(context.WithoutCancel(gCtx))
	if err != nil {
		return errors.WithMessage(err, "Init xnews err")
	}
	var topicSetting xnews.TopicSetting
	topicSetting.AddForeverLimit(100)
	err = gNews.AddTopic("PLAT", topicSetting)
	if err != nil {
		return errors.WithMessage(err, "Init xnews add topic err")
	}
	logS := xlog.DefaultSetting()
	logS.LogAddr = s.LogAddr
	logS.IfPush = true
	logS.PushMgr = push
	logS.OnLog = func(content string) {
		_ = gNews.AddMessage("PLAT", content)
	}
	log, err := xlog.NewXLog(logS)
	if err != nil {
		return err
	}
	gStorage = storage
	gStoWebPack, err = xstorage.NewWebPack(
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
	gCfg = cfg
	gPush = push
	gLog = log
	gWebMgr.Init()
	err = GPlatCore.Init()
	if err != nil {
		return errors.WithMessage(err, "Init platCore err")
	}

	gTool.flag2name = make(map[share.SvrFlag]share.SvrName)
	gTool.name2flag = make(map[share.SvrName]share.SvrFlag)
	gTool.flag2name[share.FlagAuto] = share.NameAuto
	gTool.flag2name[share.FlagNote] = share.NameNote
	gTool.flag2name[share.FlagAccount] = share.NameAccount
	// 新增服务要在这里注册
	for k, v := range gTool.flag2name {
		gTool.name2flag[v] = k
	}
	return nil
}
