package mods

import (
	"fmt"
	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/auto/setting"
	"github.com/intmian/platform/backend/services/auto/tool"
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
	req.Lang = spider.LanChinese
	result2, err := spider.QueryGNewsTop(req, newsToken)
	if err != nil {
		return "", errors.WithMessage(err, "func getNews() spider.QueryGNewsTop error")
	}
	result.Articles = append(result.Articles, result2.Articles...)
	s := ""
	for i, v := range result.Articles {
		s += fmt.Sprintf("%d. %s:\n", i+1, v.Title)
		s += "Description" + v.Description + "\n"
	}
	retry := 0
	done := false
	var re string
	for retry < 2 {
		/*
			如果不行改成单体输出 Below are the headline and summary of a news segment. Based on these, please generate a concise, friendly, and readable summary in Simplified Chinese (no more than 40 words). And score the news according to its importance to an average Chinese person, using a scale of 1-5. And analyze the type of news (e.g. politics, sports, technology).
			Output in the following json format
			{
			“type” : “...” ,
			“important” : 0-5.
			“content”:“......”
			}
		*/
		o := ai.NewOpenAI(base, token, cheap, ai.NewsRenshe)
		re, err = o.Chat(`The following is the data of the hot news of the past day crawled by using crawler (including title and summary), please do the following processing according to these contents.
1. if the content of the news is not in Simplified Chinese, then translate it into Simplified Chinese (there is no need to translate proper nouns and people's names into Chinese).
2. Generate a concise, friendly and readable summary (no more than 40 words) for each news item based on the news title and abstract. Each news item is scored according to its importance to an average Chinese person, using a scale of 1-5. 3.
3. categorize the processed news according to the type of news (e.g. politics, sports, technology) and output it in the following form
4. finally generate a 100-word summary. Requires a summary and evaluation of all the news of the day along with a corresponding evaluation of the importance of the news of the day
5. All responses must be in simplified Chinese. No news can be omitted.

### Type 1
* Use ⭐ to denote scores, e.g. a three is ⭐⭐⭐ News 1 specifics. [corresponding raw numbers]
* Use ⭐ to denote scores, e.g. a four is ⭐⭐⭐⭐ News 2 specifics. [corresponding raw numbers]
* ...
### Type 2
...
### Summary
Summarize the specifics of the summary.

The following is the original content:
` + s)
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
	//re = strings.Replace(re, "\n", "\n\n", -1)
	//	html := `<details>
	//  <summary>原始链接</summary>
	//`
	//	for i, v := range result.Articles {
	//		//re = strings.Replace(re, fmt.Sprintf("[#No.%d]", i+1), fmt.Sprintf("[[%d](%s)]", i+1, v.Url), -1)
	//		//re = strings.Replace(re, fmt.Sprintf("[#No.%d]", i+1), fmt.Sprintf("[%d]", i+1), -1)
	//		//html += fmt.Sprintf("<a href=\"%s\">[%d]%s</a><br>", v.Url, i+1, v.Title)
	//	}
	//	html += "</details>"
	md := re + "\n"

	//md += html
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
