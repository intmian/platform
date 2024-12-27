package mods

import (
	"errors"
	"fmt"
	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/auto/setting"
	"github.com/intmian/platform/backend/services/auto/tool"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TODO: 细化权限，并发控制

// Day 将每日的没有时间要求的都接入此处，比如天气新闻等
type Day struct {
	// 用于存储往期日报。
	dayReportStorage *xstorage.XStorage
}

// 用于svr的调用。
var GDay *Day

// DayReport 用于存储一天的日报.
type DayReport struct {
	Weather      spider.WeatherReturn
	WeatherIndex spider.IndexReturn
	BbcNews      []spider.BBCRssItem
	NytNews      []spider.NYTimesRssItem
	GoogleNews   []struct {
		KeyWord string
		News    []spider.GoogleRssItem
	}
}

// WholeReport 用于存储读取的全量日报.
type WholeReport struct {
	BbcNews    []spider.BBCRssItem
	NytNews    []spider.NYTimesRssItem
	GoogleNews []struct {
		keyWord string
		news    []spider.GoogleRssItem
	}
}

func GetWholeReport(c *http.Client, keywords []string) (*WholeReport, error) {
	report := &WholeReport{}
	bbcNews, err1 := spider.GetBBCRss(c)
	report.BbcNews = bbcNews
	nytNews, err2 := spider.GetNYTimesRss(c)
	report.NytNews = nytNews
	var err3 error
	report.GoogleNews = make([]struct {
		keyWord string
		news    []spider.GoogleRssItem
	}, len(keywords))
	for i, key := range keywords {
		report.GoogleNews[i].keyWord = key
		var err error
		report.GoogleNews[i].news, err = spider.GetGoogleRss(key, c)
		if err != nil {
			err3 = errors.Join(err3, err)
		}
	}
	err := errors.Join(err1, err2, err3)
	if err != nil {
		tool.GLog.WarningErr("Day", errors.Join(errors.New("func GetWholeReport() GetWholeReport error"), err))
	}
	return report, err
}

func GetDayReport(c *http.Client, keywords []string, city, weatherKey string) (*DayReport, error) {
	report := &DayReport{}
	lastDay := time.Now().AddDate(0, 0, -1)
	bbcNews, err1 := spider.GetBBCRssWithDay(lastDay, c)
	report.BbcNews = bbcNews
	nytNews, err2 := spider.GetNYTimesRssWithDay(lastDay, c)
	report.NytNews = nytNews
	var err3 error
	report.GoogleNews = make([]struct {
		KeyWord string
		News    []spider.GoogleRssItem
	}, len(keywords))
	for i, key := range keywords {
		report.GoogleNews[i].KeyWord = key
		var err error
		report.GoogleNews[i].News, err = spider.GetGoogleRssWithDay(key, lastDay, c)
		if err != nil {
			err3 = errors.Join(err3, err)
		}
	}

	// 读取天气
	weather, err4 := spider.QueryTodayWeather(weatherKey, city)
	report.Weather = weather
	weatherIndex, err5 := spider.QueryTodayIndex(weatherKey, city)
	report.WeatherIndex = weatherIndex

	err := errors.Join(err1, err2, err3, err4, err5)
	if err != nil {
		tool.GLog.WarningErr("Day", errors.Join(errors.New("func GetDayReport() GetDayReport error"), err))
	}
	return report, err
}

func (d *Day) Init() {
	//百度新闻组件已经移除
	//err1 := setting.GSetting.SetDefault(xstorage.Join("auto", "baidu", "keys"), xstorage.ToUnit([]string{
	//	"nuc",
	//	"群晖",
	//	"macbook air",
	//	"扫地机器人 发布",
	//	"kindle",
	//}, xstorage.ValueTypeSliceString))
	err1 := setting.GSetting.SetDefault(xstorage.Join("auto", "news", "keys"), xstorage.ToUnit([]string{"need input"}, xstorage.ValueTypeSliceString))
	err2 := setting.GSetting.SetDefault(xstorage.Join("openai", "base"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	err3 := setting.GSetting.SetDefault(xstorage.Join("openai", "token"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	err4 := setting.GSetting.SetDefault(xstorage.Join("openai", "cheap"), xstorage.ToUnit[bool](true, xstorage.ValueTypeBool))
	err5 := setting.GSetting.SetDefault(xstorage.Join("qweather", "key"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	err6 := setting.GSetting.SetDefault(xstorage.Join("auto", "weather", "city"), xstorage.ToUnit[string]("杭州", xstorage.ValueTypeString))
	err := misc.JoinErr(err1, err2, err3, err4, err5, err6)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Init() GetAndSetDefault error"), err))
	}
	// 初始化存储
	d.dayReportStorage, err = xstorage.NewXStorage(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.MultiSafe, xstorage.UseDisk),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   "auto_report.db",
	})
	if err != nil {
		tool.GLog.ErrorErr("auto.Day", errors.Join(errors.New("func Init() NewXStorage error"), err))
		// 这玩意不起就炸了，必须要崩溃
		panic(err)
	}
	GDay = d
}

func (d *Day) GenerateDayReport() (*DayReport, error) {
	// 读取配置
	keysV, err := setting.GSetting.Get("auto.news.keys")
	if keysV == nil {
		tool.GLog.Warning("auto.Day", "auto.news.keys not exist")
		return nil, errors.New("auto.news.keys not exist")
	}
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GenerateDayReport() Get auto.news.keys error"), err))
		return nil, errors.Join(errors.New("func GenerateDayReport() Get auto.news.keys error"), err)
	}
	keys := xstorage.ToBase[[]string](keysV)
	if keys == nil || len(keys) == 0 {
		return nil, errors.New("auto.news.keys is empty")
	}
	cityV, err := setting.GSetting.Get("auto.weather.city")
	if err != nil {
		tool.GLog.WarningErr("WEATHER", errors.Join(errors.New("func GenerateDayReport() Get auto.weather.city error"), err))
		return nil, errors.Join(errors.New("func GenerateDayReport() Get auto.weather.city error"), err)
	}
	city := xstorage.ToBase[string](cityV)
	keyV, err := setting.GSetting.Get("qweather.key")
	if keyV == nil {
		tool.GLog.Warning("WEATHER", "qweather.key not exist")
		return nil, errors.New("qweather.key not exist")
	}
	if err != nil {
		tool.GLog.WarningErr("WEATHER", errors.Join(errors.New("func GenerateDayReport() Get qweather.key error"), err))
		return nil, errors.Join(errors.New("func GenerateDayReport() Get qweather.key error"), err)
	}
	weatherKey := xstorage.ToBase[string](keyV)

	// 如果是debug就使用代理
	var client *http.Client
	if setting.GBaseSetting.Debug {
		client = &http.Client{
			Transport: &http.Transport{
				Proxy: http.ProxyURL(&url.URL{
					Scheme: "http",
					Host:   "localhost:7890",
				}),
			},
		}
	} else {
		client = &http.Client{}
	}
	report, err := GetDayReport(client, keys, city, weatherKey)
	if err != nil {
		return nil, errors.Join(errors.New("func GenerateDayReport() GetDayReport error"), err)
	}

	// 进行进一步处理
	// 1. nytime需要破解
	for i, news := range report.NytNews {
		report.NytNews[i].Link = "https://www.removepaywall.com/search?url=" + news.Link
	}
	// 2. 调用ai进行翻译
	err = translate(report)
	if err != nil {
		return nil, errors.Join(errors.New("func GenerateDayReport() translate error"), err)
	}
	// 3. 存储
	timeStr := time.Now().Format("2006-01-02")
	err = d.dayReportStorage.SetToJson(timeStr, report)
	if err != nil {
		return nil, errors.Join(errors.New("func GenerateDayReport() SetToJson error"), err)
	}

	// 从数据库添加进report列表
	var reportList []string
	err = d.dayReportStorage.GetFromJson("report_list", &reportList)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			reportList = []string{}
		} else {
			return nil, errors.Join(errors.New("func GenerateDayReport() GetFromJson report_list error"), err)
		}
	}

	find := false
	for _, v := range reportList {
		if v == timeStr {
			find = true
			break
		}
	}
	if !find {
		reportList = append(reportList, timeStr)
		err = d.dayReportStorage.SetToJson("report_list", reportList)
		if err != nil {
			return nil, errors.Join(errors.New("func GenerateDayReport() SetToJson report_list error"), err)
		}
	}

	return report, nil
}

func translate(report *DayReport) error {
	// 获得token和base
	baseV, err := setting.GSetting.Get("openai.base")
	if baseV == nil {
		tool.GLog.Warning("GNews", "openai.base not exist")
		return errors.New("openai.base not exist")
	}
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.Join(errors.New("func Do() Get openai.base error"), err))
		return errors.Join(errors.New("func Do() Get openai.base error"), err)
	}
	base := xstorage.ToBase[string](baseV)
	if base == "" || base == "need input" {
		return errors.New("openai.base is empty")
	}
	tokenV, err := setting.GSetting.Get("openai.token")
	if tokenV == nil {
		tool.GLog.Warning("GNews", "openai.token not exist")
		return errors.New("openai.token not exist")
	}
	if err != nil {
		tool.GLog.WarningErr("GNews", errors.Join(errors.New("func Do() Get openai.token error"), err))
		return errors.Join(errors.New("func Do() Get openai.token error"), err)
	}
	token := xstorage.ToBase[string](tokenV)
	if token == "" || token == "need input" {
		tool.GLog.Warning("GNews", "openai.token is empty")
		return errors.New("openai.token is empty")
	}

	// 翻译就用便宜的
	chat := ai.NewOpenAI(base, token, true, ai.DefaultRenshe)
	if chat == nil {
		return errors.New("NewOpenAI error")
	}
	const transPromt = "仅返回以下文字的简体中文翻译，无需翻译则原样返回：\n"
	for i, news := range report.NytNews {
		translatedTitle, err := chat.Chat(transPromt + news.Title)
		if err != nil {
			return errors.Join(errors.New("func translate() translate title error"), err)
		}
		report.NytNews[i].Title = translatedTitle

		translatedDescription, err := chat.Chat(transPromt + news.Description)
		if err != nil {
			return errors.Join(errors.New("func translate() translate description error"), err)
		}
		report.NytNews[i].Description = translatedDescription
	}
	for i, news := range report.BbcNews {
		translatedTitle, err := chat.Chat(transPromt + news.Title)
		if err != nil {
			return errors.Join(errors.New("func translate() translate title error"), err)
		}
		report.BbcNews[i].Title = translatedTitle

		translatedDescription, err := chat.Chat(transPromt + news.Description)
		if err != nil {
			return errors.Join(errors.New("func translate() translate description error"), err)
		}
		report.BbcNews[i].Description = translatedDescription
	}

	return nil
}

func (d *Day) Do() {
	report, err := d.GenerateDayReport()
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() GenerateDayReport error"), err))
		return
	}

	// 推送
	todayStr := time.Now().Format("01月02日")
	md := misc.MarkdownTool{}
	md.AddTitle(fmt.Sprintf("日安，%s的播报", todayStr), 2)
	weatherDone := false
	weather := ""
	if len(report.Weather.Daily) > 0 {
		weatherDone = true
		weather, err = spider.MakeMiniWeatherMD("杭州", report.Weather)
		if err != nil {
			tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() MakeTodayWeatherMD error"), err))
		}
	}
	if !weatherDone || weather == "" {
		md.AddContent("今日天气获取失败")
	} else {
		md.AddMd(weather)
	}

	// 生成今日谷歌新闻的摘要，有哪些关键词的新闻更新了。
	keyWordsUpdate := []string{}
	for _, news := range report.GoogleNews {
		if len(news.News) > 0 {
			keyWordsUpdate = append(keyWordsUpdate, news.KeyWord)
		}
	}
	if len(keyWordsUpdate) > 0 {
		str := strings.Join(keyWordsUpdate, "、")
		md.AddContent(fmt.Sprintf("今日关键新闻更新：%s", str))
	} else {
		md.AddContent("今日关注新闻无更新")
	}

	// 生成今日BBC、NYT新闻的摘要
	str := `今日有%d条BBC新闻，%d条NYT新闻`
	str = fmt.Sprintf(str, len(report.BbcNews), len(report.NytNews))
	md.AddContent(str)

	// 生成分享链接
	// TODO: 日后可以做成配置的基础url方便别人用
	reportLink := fmt.Sprintf("[点击查看日报](https://plat.intmian.com/day-report/%s)", time.Now().Format("2006-01-02"))
	md.AddTitle(reportLink, 3)
	err = tool.GPush.Push("日报", md.ToStr(), true)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() Push error"), err))
	}
}

func (d *Day) GetName() string {
	return "auto.Day"
}

func (d *Day) GetInitTimeStr() string {
	return "0 0 6 * * ?"
}

func (d *Day) GetDayReport(day time.Time) (*DayReport, error) {
	timeStr := day.Format("2006-01-02")
	report := &DayReport{}
	err := d.dayReportStorage.GetFromJson(timeStr, report)
	if err != nil {
		return nil, errors.Join(errors.New("func GetDayReport() GetFromJson error"), err)
	}
	return report, nil
}

func (d *Day) GetWholeReport() (*WholeReport, error) {
	keysV, err := setting.GSetting.Get("auto.news.keys")
	if keysV == nil {
		tool.GLog.Warning("auto.Day", "auto.news.keys not exist")
		return nil, errors.New("auto.news.keys not exist")
	}
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GetWholeReport() Get auto.news.keys error"), err))
		return nil, errors.Join(errors.New("func GetWholeReport() Get auto.news.keys error"), err)
	}
	keys := xstorage.ToBase[[]string](keysV)
	return GetWholeReport(nil, keys)
}

func (d *Day) GetReportList() ([]string, error) {
	var reportList []string
	err := d.dayReportStorage.GetFromJson("report_list", &reportList)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			reportList = []string{}
		} else {
			return nil, errors.Join(errors.New("func GetReportList() GetFromJson report_list error"), err)
		}
	}
	return reportList, nil
}
