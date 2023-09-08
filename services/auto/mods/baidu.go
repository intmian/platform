package mods

import (
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/tool"
)

type Baidu struct {
}

func (b *Baidu) Init() {
	if !setting.GSettingMgr.Exist("baidu.keys") {
		setting.GSettingMgr.Set("baidu.keys", []string{
			"nuc",
			"群晖",
			"macbook air",
			"扫地机器人 发布",
			"kindle",
		})
		setting.GSettingMgr.Save()
	}
}

func (b *Baidu) Do() {
	if !setting.GSettingMgr.Exist("baidu.keys") {
		tool.GLog.Log(xlog.EError, "BAIDU", "baidu.keys not exist")
		return
	}
	i := setting.GSettingMgr.Get("baidu.keys")
	switch i.(type) {
	case []interface{}:
	default:
		tool.GLog.Log(xlog.EError, "BAIDU", "baidu.keys not []interface{}")
		return
	}
	params := i.([]interface{})
	if params == nil || len(params) == 0 {
		return
	}
	var keywords []string
	var newss [][]spider.BaiduNew
	hasErrAll := false
	noNewsAll := false
	for _, v := range params {
		news, hasErr, noNews := spider.GetBaiduNews(v.(string), true)
		keywords = append(keywords, v.(string))
		newss = append(newss, news)
		hasErrAll = hasErrAll || hasErr
		noNewsAll = noNewsAll && noNews
	}
	if hasErrAll {
		tool.GLog.Log(xlog.EWarning, "BAIDU", "接口存在错误")
	}
	if noNewsAll {
		tool.GLog.Log(xlog.EWarning, "BAIDU", "接口为空")
	}

	s := spider.ParseNewToMarkdown(keywords, newss)
	tool.GPush.PushPushDeer("百度新闻", s, true)
}

func (b *Baidu) GetName() string {
	return "BAIDU"
}

func (b *Baidu) GetInitTimeStr() string {
	return "0 0 8 * * ?"
}
