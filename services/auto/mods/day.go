package mods

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/services/auto/setting"
	"github.com/intmian/platform/services/auto/tool"
	"sync"
	"time"
)

// Day 将每日的没有时间要求的都接入此处，比如天气新闻等
type Day struct {
}

func (d Day) Init() {
	err1 := setting.GSetting.SetDefault(xstorage.Join("auto", "baidu", "keys"), xstorage.ToUnit([]string{
		"nuc",
		"群晖",
		"macbook air",
		"扫地机器人 发布",
		"kindle",
	}, xstorage.ValueTypeSliceString))
	err2 := setting.GSetting.SetDefault(xstorage.Join("openai", "base"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	err3 := setting.GSetting.SetDefault(xstorage.Join("openai", "token"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	err4 := setting.GSetting.SetDefault(xstorage.Join("openai", "cheap"), xstorage.ToUnit[bool](true, xstorage.ValueTypeBool))
	err5 := setting.GSetting.SetDefault(xstorage.Join("auto", "GNews", "newsToken"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	err6 := setting.GSetting.SetDefault(xstorage.Join("auto", "weather", "province"), xstorage.ToUnit[string]("浙江", xstorage.ValueTypeString))
	err7 := setting.GSetting.SetDefault(xstorage.Join("auto", "weather", "city"), xstorage.ToUnit[string]("杭州", xstorage.ValueTypeString))
	err := misc.JoinErr(err1, err2, err3, err4, err5, err6, err7)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Init() GetAndSetDefault error"), err))
	}
}

func (d Day) Do() {
	wg := sync.WaitGroup{}
	wg.Add(3)
	// 分别获取天气、百度新闻、GNews
	baidu := ""
	hot := ""
	weather := spider.Weather{}
	weatherDone := false
	go func() {
		defer wg.Done()
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
			news, err, retry := spider.GetTodayBaiduNews(v)
			allRetry += retry
			keywords = append(keywords, v)
			newss = append(newss, news)
			if err != nil {
				e := fmt.Errorf("百度新闻 %s 获取失败: %s", v, err.Error())
				errs = append(errs, e)
			}
		}
		if len(errs) > 0 {
			tool.GLog.ErrorErr("BAIDU", errors.Join(errors.New("func Do() spider.GetTodayBaiduNews error"), errors.New(fmt.Sprint(errs))))
			return
		}
		baidu = spider.ParseNewToMarkdown(keywords, newss)
		if allRetry > 0 {
			retryStr := fmt.Sprintf("百度新闻 总重试次数: %d", allRetry)
			tool.GLog.Info("BAIDU", retryStr)
		}
	}()
	go func() {
		defer wg.Done()
		// 获得token和base
		baseV, err := setting.GSetting.Get("openai.base")
		if baseV == nil {
			tool.GLog.Warning("GNews", "openai.base not exist")
			return
		}
		if err != nil {
			tool.GLog.WarningErr("GNews", errors.Join(errors.New("func Do() Get openai.base error"), err))
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
			tool.GLog.WarningErr("GNews", errors.Join(errors.New("func Do() Get openai.token error"), err))
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
			tool.GLog.WarningErr("GNews", errors.Join(errors.New("func Do() Get openai.cheap error"), err))
			return
		}
		cheap := xstorage.ToBase[bool](cheapV)
		newsTokenV, err := setting.GSetting.Get("auto.GNews.newsToken")
		if newsTokenV == nil {
			tool.GLog.Warning("GNews", "auto.GNews.newsToken not exist")
			return
		}
		if err != nil {
			tool.GLog.WarningErr("GNews", errors.Join(errors.New("func Do() Get auto.GNews.newsToken error"), err))
			return
		}
		newsToken := xstorage.ToBase[string](newsTokenV)
		if newsToken == "" || newsToken == "need input" {
			tool.GLog.Warning("GNews", "auto.GNews.newsToken is empty")
			return
		}
		md, err := getNews(newsToken, base, token, cheap)
		if err != nil {
			tool.GLog.WarningErr("GNews", errors.Join(errors.New("func Do() getNews error"), err))
			return
		}
		hot = md
	}()
	go func() {
		defer wg.Done()
		proV, err := setting.GSetting.Get("auto.weather.province")
		if err != nil {
			tool.GLog.WarningErr("WEATHER", errors.Join(errors.New("func Do() Get auto.weather.province error"), err))
			return
		}
		pro := xstorage.ToBase[string](proV)
		cityV, err := setting.GSetting.Get("auto.weather.city")
		if err != nil {
			tool.GLog.WarningErr("WEATHER", errors.Join(errors.New("func Do() Get auto.weather.city error"), err))
			return
		}
		city := xstorage.ToBase[string](cityV)
		s, err := spider.GetWeatherDataOri(pro, city)
		if err != nil {
			tool.GLog.WarningErr("WEATHER", errors.Join(errors.New("func Do() spider.GetWeatherDataOri error"), err))
			return
		}
		weather, err = spider.GetTodayWeather(s)
		if err != nil {
			tool.GLog.WarningErr("WEATHER", errors.Join(errors.New("func Do() spider.GetTodayWeather error"), err))
			return
		}
		weatherDone = true
	}()
	wg.Wait()

	// 留档方便别的地方使用
	todayStr := time.Now().Format("2006-01-02")
	if weatherDone {
		strJ, err1 := json.Marshal(weather)
		err2 := setting.GSetting.Set(xstorage.Join("auto", "weather", "today"), xstorage.ToUnit[string](string(strJ), xstorage.ValueTypeString))
		err3 := setting.GSetting.Set(xstorage.Join("auto", "weather", "todayStr"), xstorage.ToUnit[string](todayStr, xstorage.ValueTypeString))
		err := misc.JoinErr(err1, err2, err3)
		if err != nil {
			tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() Set auto.weather.today error"), err))
		}
	}
	if baidu != "" {
		err1 := setting.GSetting.Set(xstorage.Join("auto", "baidu", "today"), xstorage.ToUnit[string](baidu, xstorage.ValueTypeString))
		err2 := setting.GSetting.Set(xstorage.Join("auto", "baidu", "todayStr"), xstorage.ToUnit[string](todayStr, xstorage.ValueTypeString))
		err := misc.JoinErr(err1, err2)
		if err != nil {
			tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() Set auto.baidu.today error"), err))
		}
	}
	if hot != "" {
		err1 := setting.GSetting.Set(xstorage.Join("auto", "GNews", "today"), xstorage.ToUnit[string](hot, xstorage.ValueTypeString))
		err2 := setting.GSetting.Set(xstorage.Join("auto", "GNews", "todayStr"), xstorage.ToUnit[string](todayStr, xstorage.ValueTypeString))
		err := misc.JoinErr(err1, err2)
		if err != nil {
			tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() Set auto.GNews.today error"), err))
		}
	}

	// 推送
	md := misc.MarkdownTool{}
	md.AddTitle(fmt.Sprintf("日安，以下是%s的播报", todayStr), 2)
	md.AddTitle("天气", 3)
	if !weatherDone {
		md.AddContent("今日天气获取失败")
	} else {
		md.AddContent(fmt.Sprintf("%s %s %s", weather.Condition, weather.IndexMap["穿衣"].Why, weather.IndexMap["污染"].Why))
		md.AddList(weather.IndexMap["穿衣"].Status, 1)
		md.AddList(weather.IndexMap["污染"].Status, 1)
	}
	md.AddTitle("关注新闻", 3)
	if baidu == "" {
		md.AddContent("今日关注新闻获取失败")
	} else {
		md.AddMd(baidu)
	}
	md.AddTitle("热点新闻", 3)
	if hot == "" {
		md.AddContent("今日热点新闻获取失败")
	} else {
		md.AddMd(hot)
	}
	timeStr := time.Now().Format("2006-01-02 15:04:05")
	md2 := "> 原始数据由GNews、百度新闻、百度天气提供, 热点新闻基础行文由OpenAI生成。\n"
	md2 += "> \n"
	md2 += fmt.Sprintf("> 生成时间: %s。\n", timeStr)
	md.AddMd(md2)
	err := tool.GPush.Push("日报", md.ToStr(), true)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() Push error"), err))
	}
}

func (d Day) GetName() string {
	return "auto.Day"
}

func (d Day) GetInitTimeStr() string {
	return "0 0 6 * * ?"
}
