package mods

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/mian_go_lib/tool/xstorage"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/tool"
)

type Baidu struct {
}

func (b *Baidu) Init() {
	err := setting.GSetting.SetDefault(xstorage.Join("auto", "baidu", "keys"), xstorage.ToUnit([]string{
		"nuc",
		"群晖",
		"macbook air",
		"扫地机器人 发布",
		"kindle",
	}, xstorage.ValueTypeSliceString))
	if err != nil {
		tool.GLog.LogWithErr(xlog.EWarning, "auto.BAIDU", errors.Join(errors.New("func Init() GetAndSetDefault error"), err))
	}
}

func (b *Baidu) Do() {
	ok, keys, err := xstorage.Get[[]string](setting.GSetting, "auto.baidu.keys")
	if !ok {
		tool.GLog.Log(xlog.EError, "BAIDU", "baidu.keys not exist")
		return
	}
	if err != nil {
		tool.GLog.LogWithErr(xlog.EError, "BAIDU", errors.Join(errors.New("func Do() Get auto.baidu.keys error"), err))
		return
	}
	if keys == nil || len(keys) == 0 {
		return
	}
	var keywords []string
	var newss [][]spider.BaiduNew
	hasErrAll := false
	noNewsAll := false
	for _, v := range keys {
		news, hasErr, noNews := spider.GetBaiduNews(v, true)
		keywords = append(keywords, v)
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
	return "auto.BAIDU"
}

func (b *Baidu) GetInitTimeStr() string {
	return "0 0 8 * * ?"
}
