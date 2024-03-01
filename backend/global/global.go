package global

import (
	"context"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xnews"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xpush/pushmod"
	"github.com/intmian/mian_go_lib/xstorage"
	coreShare "github.com/intmian/platform/backend/share"
	"github.com/pkg/errors"
)

var GCtx = context.Background()
var GLog *xlog.XLog
var GPush *xpush.XPush
var GStorage *xstorage.XStorage
var GStoWebPack *xstorage.WebPack
var GNews *xnews.XNews // 用来保存最近的日志 方便查询
var GBaseSetting *misc.FileUnit[coreShare.BaseSetting]

func Init() error {
	if !misc.PathExist("base_setting.toml") {
		return errors.New("base_setting.toml not exist")
	}
	GBaseSetting = misc.NewFileUnit[coreShare.BaseSetting](misc.FileUnitToml, "base_setting.toml")
	err := GBaseSetting.Load()
	if err != nil {
		return errors.WithMessage(err, "Init baseSetting err")
	}
	s := GBaseSetting.Copy()
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
		Ctx:               context.WithoutCancel(GCtx),
	})
	if err != nil {
		return err
	}
	GNews, err = xnews.NewXNews(context.WithoutCancel(GCtx))
	if err != nil {
		return errors.WithMessage(err, "Init xnews err")
	}
	var topicSetting xnews.TopicSetting
	topicSetting.AddForeverLimit(100)
	err = GNews.AddTopic("PLAT", topicSetting)
	if err != nil {
		return errors.WithMessage(err, "Init xnews add topic err")
	}
	logS := xlog.DefaultSetting()
	logS.LogAddr = s.LogAddr
	logS.IfPush = true
	logS.PushMgr = push
	logS.OnLog = func(content string) {
		_ = GNews.AddMessage("PLAT", content)
	}
	log, err := xlog.NewXLog(logS)
	if err != nil {
		return err
	}
	GStorage = storage
	GStoWebPack, err = xstorage.NewWebPack(
		xstorage.WebPackSetting{
			LogFrom: "plat",
			Log:     log,
		},
		storage,
	)
	if err != nil {
		return errors.WithMessage(err, "Init WebPack err")
	}
	GPush = push
	GLog = log
	return nil
}
