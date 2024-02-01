package mods

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
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
		tool.GLog.WarningErr("auto.BAIDU", errors.Join(errors.New("func Init() GetAndSetDefault error"), err))
	}
}

func (b *Baidu) Do() {
	keysV, err := setting.GSetting.Get("auto.baidu.keys")
	if keysV == nil {
		tool.GLog.Error("BAIDU", "baidu.keys not exist")
		return
	}
	if err != nil {
		tool.GLog.ErrorErr("BAIDU", errors.Join(errors.New("func Do() Get auto.baidu.keys error"), err))
		return
	}
	keys := xstorage.ToBase[[]string](keysV)
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
		tool.GLog.Warning("BAIDU", "接口存在错误")
	}
	if noNewsAll {
		tool.GLog.Warning("BAIDU", "接口为空")
	}

	s := spider.ParseNewToMarkdown(keywords, newss)
	err = tool.GPush.Push("百度新闻", s, true)
	if err != nil {
		tool.GLog.ErrorErr("BAIDU", errors.Join(errors.New("func Do() Push error"), err))
		return
	}
}

func (b *Baidu) GetName() string {
	return "auto.BAIDU"
}

func (b *Baidu) GetInitTimeStr() string {
	return "0 0 8 * * ?"
}
