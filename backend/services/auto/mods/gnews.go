package mods

import (
	"fmt"

	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/auto/setting"
	"github.com/intmian/platform/backend/services/auto/tool"
	backendshare "github.com/intmian/platform/backend/share"
	"github.com/pkg/errors"
	"time"
)

type GNews struct{}

func (G GNews) Init() {
	err := setting.GSetting.SetDefault(xstorage.Join("auto", "GNews", "newsToken"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	if err != nil {
		tool.GLog.WarningErr("auto.GNews", errors.WithMessage(err, "func Init() GetAndSetDefault error"))
	}
}

func (G GNews) Do() {
	aiCfg, err := backendshare.GetAIConfig(setting.GCfg)
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() GetAIConfig error"))
		return
	}
	if aiCfg.Base == "" || aiCfg.Base == "need input" {
		tool.GLog.Warning("GNews", "openai.base is empty")
		return
	}
	if aiCfg.Token == "" || aiCfg.Token == "need input" {
		tool.GLog.Warning("GNews", "openai.token is empty")
		return
	}
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
	md, err := getNews(newsToken, aiCfg)
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() getNews error"))
		return
	}
	err = tool.GPush.Push("每日热点", md, true)
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.WithMessage(err, "func Do() Push error"))
	}
}

func getNews(newsToken string, aiCfg backendshare.AIConfig) (string, error) {
	// 获取昨天0点到今天0点的新闻，今天发生新闻可能还没有稳定下来，如果到当前时间可能会导致新的新闻永远上不了榜或者重复报。近期的新闻也可能浮动变动过大，等待热度固定。
	from := time.Now().AddDate(0, 0, -1)
	from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, from.Location())
	to := time.Date(time.Now().Year(), time.Now().Month(), time.Now().Day(), 0, 0, 0, 0, time.Now().Location())
	req := spider.GNewsTop{
		Lang: spider.LanEnglish,
		From: spider.GetUniTimeStr(from),
		To:   spider.GetUniTimeStr(to),
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
	mode := aiCfg.ModeForScene(backendshare.AISceneSummary, ai.ModelModeCheap)
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
		o := ai.NewOpenAIWithMode(aiCfg.Base, aiCfg.Token, mode, ai.AiTypeChatGPT, aiCfg.ModelPools)
		re, err = o.Chat(`You are a journalist who is proficient in writing in both English and Chinese. The following is the data of the hot news of the past day crawled by using crawler (including title and summary), please do the following processing according to these contents.
1. if the content of the news is not in Simplified Chinese, then translate it into Simplified Chinese (there is no need to translate proper nouns and people's names into Chinese).
2. Generate a concise, friendly and readable summary (no more than 30 words) for each news item based on the news title and abstract.
3. categorize the processed news according to the type of news (e.g. politics, sports, technology) and output it in the following form
4. finally generate a 50-word summary. Requires a summary and evaluation of all the news of the day along with a corresponding evaluation of the importance of the news of the day
5. All responses must be in simplified Chinese. No news can be omitted.

### Type 1
* News 1 specifics. [corresponding raw numbers]
* News 2 specifics. [corresponding raw numbers]
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
