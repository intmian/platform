package mods

import (
	"fmt"
	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/tool"
	"github.com/pkg/errors"
	"time"
)

type GNews struct{}

func (G GNews) Init() {
	// 为了方便从控制台修改，这里写一下默认值
	err := setting.GSetting.SetDefault(xstorage.Join("openai", "base"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	if err != nil {
		tool.GLog.WarningErr("auto.GNews", errors.WithMessage(err, "func Init() GetAndSetDefault error"))
	}
	err = setting.GSetting.SetDefault(xstorage.Join("openai", "token"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	if err != nil {
		tool.GLog.WarningErr("auto.GNews", errors.WithMessage(err, "func Init() GetAndSetDefault error"))
	}
	err = setting.GSetting.SetDefault(xstorage.Join("openai", "cheap"), xstorage.ToUnit[bool](true, xstorage.ValueTypeBool))
	if err != nil {
		tool.GLog.WarningErr("auto.GNews", errors.WithMessage(err, "func Init() GetAndSetDefault error"))
	}
	err = setting.GSetting.SetDefault(xstorage.Join("auto", "GNews", "newsToken"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	if err != nil {
		tool.GLog.WarningErr("auto.GNews", errors.WithMessage(err, "func Init() GetAndSetDefault error"))
	}
}

func (G GNews) Do() {
	// 获得token和base
	baseV, err := setting.GSetting.Get("openai.base")
	if baseV == nil {
		tool.GLog.Warning("GNews", "openai.base not exist")
		return
	}
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() Get openai.base error"))
		return
	}
	base := xstorage.ToBase[string](baseV)
	if base == "" || base == "need input" {
		tool.GLog.Warning("GNews", "openai.base is empty")
		return
	}
	tokenV, err := setting.GSetting.Get("openai.token")
	if tokenV == nil {
		tool.GLog.Warning("GNews", "openai.token not exist")
		return
	}
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() Get openai.token error"))
		return
	}
	token := xstorage.ToBase[string](tokenV)
	if token == "" || token == "need input" {
		tool.GLog.Warning("GNews", "openai.token is empty")
		return
	}
	cheapV, err := setting.GSetting.Get("openai.cheap")
	if cheapV == nil {
		tool.GLog.Warning("GNews", "openai.cheap not exist")
		return
	}
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() Get openai.cheap error"))
		return
	}
	cheap := xstorage.ToBase[bool](cheapV)
	newsTokenV, err := setting.GSetting.Get("auto.GNews.newsToken")
	if newsTokenV == nil {
		tool.GLog.Warning("GNews", "auto.GNews.newsToken not exist")
		return
	}
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() Get auto.GNews.newsToken error"))
		return
	}
	newsToken := xstorage.ToBase[string](newsTokenV)
	if newsToken == "" || newsToken == "need input" {
		tool.GLog.Warning("GNews", "auto.GNews.newsToken is empty")
		return
	}
	md, err := getNews(newsToken, base, token, cheap)
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() getNews error"))
		return
	}
	err = tool.GPush.Push("每日热点", md, true)
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() Push error"))
	}
}

func getNews(newsToken, base, token string, cheap bool) (string, error) {
	req := spider.GNewsTop{
		Lang: spider.LanEnglish,
		From: spider.GetUniTimeStr(time.Now().AddDate(0, 0, -1)),
		To:   spider.GetUniTimeStr(time.Now()),
	}
	result, err := spider.QueryGNewsTop(req, newsToken)
	if err != nil {
		return "", errors.WithMessage(err, "func getNews() spider.QueryGNewsTop error")
	}
	s := ""
	for i, v := range result.Articles {
		s += fmt.Sprintf("%d. %s-%s:\n", i+1, v.Title, v.Url)
		s += "Description" + v.Description + "\n"
	}
	retry := 0
	done := false
	var re string
	for retry < 2 {
		o := ai.NewOpenAI(base, token, cheap, ai.DefaultRenshe)
		re, err = o.Chat("" +
			"以下使用爬虫爬取的过去一天的热点新闻的数据，请根据这些内容做以下处理。\n" +
			"整理为一篇总结文章\n" +
			"使用中文，允许在其中加入修饰或者自己的评价\n" +
			"不需要将专有名词、人名翻译为中文\n" +
			"文章满足简洁切要的内容、平易友善的叙述与高度的可读性。文章里必须提到每一个新闻热点，同时转折尽量自然。\n" +
			"以不同的地区和领域来区分各个段落\n" +
			"每个新闻热点后需要用[序号](url)的形式标注引用\n" +
			"要求总字数在150中文字符以内，分段需要使用两个换行符\n\n" + s)
		if re != "" && err == nil {
			done = true
			break
		}
		tool.GLog.Info("auto.GNews", "open ai response is empty, retry %d", retry+1)
		retry++
		time.Sleep(time.Minute)
	}
	if !done {
		return "", errors.WithMessage(err, "func getNews() open ai response is empty after retry.")
	}
	md := re + "\n"
	//	for _, v := range result.Articles {
	//		s := `> [%s](%s)
	//> %s
	//`
	//		md += fmt.Sprintf(s, v.Title, v.Url, v.Description)
	//	}
	return md, nil
}

func (G GNews) GetName() string {
	return "auto.GNews"
}

func (G GNews) GetInitTimeStr() string {
	return "0 0 7 * * ?"
}
