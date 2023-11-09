package tool

import (
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/mian_go_lib/tool/xpush"
)

func Init(push *xpush.Mgr, log *xlog.Mgr) {
	//GPush = xpush.NewMgr(&xpush.EmailToken{}, &xpush.PushDeerToken{
	//	Token: setting.GSettingMgr.Get("pushdeer_token").(string),
	//}, "autogogo")
	//GLog = xlog.SimpleNewMgr(GPush, "", "", "autogogo")
	//GLog.LogAddr = "./static/log"
	//GLog.Printer = log_cache.GLogCache.Add
	GPush = push
	GLog = log
	GLog.Log(xlog.ELog, "INIT", "日志、推送初始化完成")
}

var GLog *xlog.Mgr
var GPush *xpush.Mgr
