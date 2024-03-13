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
	for _, v := range result.Articles {
		s += "title" + v.Title + "\n"
		s += "Description" + v.Description + "\n"
	}
	o := ai.NewOpenAI(base, token, cheap, "你是一台由mian研发的新闻机器人，你具备强大的语言能力，能像文学专家那样写作，也能像专业记者那样编写新闻")
	re, err := o.Chat("" +
		"以下是一天内发生的热点新闻。" +
		"你具备强大的语言能力，能像文学专家那样写作，也能像专业记者那样编写新闻，请根据这些内容写一篇通信稿" +
		"使用中文汇总以下新闻的内容为几段话，允许在其中加入文学修饰或者自己的评价。" +
		"要求言语通顺、优美、专业，具备文学美感，不能丢失任何一个新闻热点，同时转折尽量自然，可以根据地区、主题进行合理安排，允许调换新闻顺序。" +
		"要求总字数在200以内，分段需要使用两个换行符\n" + s)
	if err != nil {
		return "", errors.WithMessage(err, "func getNews() o.Chat error")
	}
	md := fmt.Sprintf("### %d月%d日每日热点\n", time.Now().Month(), time.Now().Day())
	md += re + "\n"
	//	for _, v := range result.Articles {
	//		s := `> [%s](%s)
	//> %s
	//`
	//		md += fmt.Sprintf(s, v.Title, v.Url, v.Description)
	//	}
	md += `> 以上是今日热点新闻。原始数据由GNews提供, 基础行文由OpenAI生成。`
	return md, nil
}

func (G GNews) GetName() string {
	return "auto.GNews"
}

func (G GNews) GetInitTimeStr() string {
	return "0 0 7 * * ?"
}
