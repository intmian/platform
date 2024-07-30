package mods

import (
	"errors"
	"fmt"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/auto/setting"
	"github.com/intmian/platform/backend/services/auto/tool"
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
	allRetry := 0
	errs := make([]error, 0)
	for _, v := range keys {
		unit, _ := setting.GSetting.Get(xstorage.Join("auto", "baidu", "key", "last", v))
		lastLink := ""
		if unit != nil {
			lastLink = xstorage.ToBase[string](unit)
		}

		news, newLink, err, retry := spider.GetBaiduNewsNew(v, lastLink, 1)
		allRetry += retry
		keywords = append(keywords, v)
		newss = append(newss, news)
		if err != nil {
			e := fmt.Errorf("百度新闻 %s 获取失败: %s", v, err.Error())
			errs = append(errs, e)
		}
		if newLink != "" {
			err = setting.GSetting.Set(xstorage.Join("auto", "baidu", "key", "last", v), xstorage.ToUnit(newLink, xstorage.ValueTypeString))
			if err != nil {
				e := fmt.Errorf("百度新闻 %s 保存最新链接失败: %s", v, err.Error())
				errs = append(errs, e)
			}
		}
		tool.GLog.Info("BAIDU", fmt.Sprintf("get %s news suc,num:%d oldLink:%s newLink:%s", v, len(news), lastLink, newLink))
	}
	if len(errs) > 0 {
		tool.GLog.ErrorErr("BAIDU", errors.Join(errors.New("func Do() spider.GetTodayBaiduNews error"), errors.New(fmt.Sprint(errs))))
		return
	}
	s := spider.ParseNewToMarkdown(keywords, newss)
	if allRetry > 0 {
		retryStr := fmt.Sprintf("百度新闻 总重试次数: %d", allRetry)
		tool.GLog.Debug("BAIDU", retryStr)
	}
	err = tool.GPush.Push("关注新闻", s, true)
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
