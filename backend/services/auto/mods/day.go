package mods

import (
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/auto/setting"
	"github.com/intmian/platform/backend/services/auto/tool"
	backendshare "github.com/intmian/platform/backend/share"
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
	Summary      string
	Digest       *DayDigest `json:"digest,omitempty"`
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
		KeyWord string
		News    []spider.GoogleRssItem
	}
}

func getWholeReport(c *http.Client, keywords []string) (*WholeReport, error) {
	report := &WholeReport{}
	bbcNews, err1 := spider.GetBBCRss(c)
	report.BbcNews = bbcNews
	nytNews, err2 := spider.GetNYTimesRss(c)
	report.NytNews = nytNews
	var err3 error
	report.GoogleNews = make([]struct {
		KeyWord string
		News    []spider.GoogleRssItem
	}, 0, len(keywords))
	for _, key := range keywords {
		// 如果以#废弃结尾就跳过
		runes := []rune(key)
		if len(runes) > 3 && string(runes[len(runes)-3:]) == "#废弃" {
			continue
		}
		newses, err := spider.GetGoogleRss(key, c)
		if err != nil {
			err3 = errors.Join(err3, err)
		}
		report.GoogleNews = append(report.GoogleNews, struct {
			KeyWord string
			News    []spider.GoogleRssItem
		}{KeyWord: key, News: newses})
	}
	err := errors.Join(err1, err2, err3)
	if err != nil {
		tool.GLog.WarningErr("Day", errors.Join(errors.New("func GetWholeReport() GetWholeReport error"), err))
	}

	// 进行进一步处理
	// 1. 去除简报 nytime需要破解
	newNytNews := []spider.NYTimesRssItem{}
	for _, news := range report.NytNews {
		if !strings.Contains(news.Title, "Briefing") {
			newNytNews = append(newNytNews, news)
		}
	}
	report.NytNews = newNytNews
	for i, news := range report.NytNews {
		report.NytNews[i].Link = "https://www.removepaywall.com/search?url=" + news.Link
	}
	// 2. 调用ai进行翻译
	err = translateW(report)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GenerateWholeReport() translate error"), err))
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
	}, 0, len(keywords))
	for _, key := range keywords {
		// 如果以#废弃结尾就跳过
		runes := []rune(key)
		if len(runes) > 3 && string(runes[len(runes)-3:]) == "#废弃" {
			continue
		}
		newses, err := spider.GetGoogleRssWithDay(key, lastDay, c)
		if err != nil {
			err3 = errors.Join(err3, err)
		}
		report.GoogleNews = append(report.GoogleNews, struct {
			KeyWord string
			News    []spider.GoogleRssItem
		}{KeyWord: key, News: newses})
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
	err2 := setting.GSetting.SetDefault(xstorage.Join("qweather", "key"), xstorage.ToUnit[string]("need input", xstorage.ValueTypeString))
	err3 := setting.GSetting.SetDefault(xstorage.Join("auto", "weather", "city"), xstorage.ToUnit[string]("杭州", xstorage.ValueTypeString))
	err := misc.JoinErr(err1, err2, err3)
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

	var report *DayReport
	for i := 0; i < 3; i++ {
		report, err = GetDayReport(client, keys, city, weatherKey)
		if err == nil {
			break
		}
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GenerateDayReport() GetDayReport error, retrying..."), err))
	}
	if err != nil {
		return nil, errors.Join(errors.New("func GenerateDayReport() GetDayReport error"), err)
	}
	if report == nil {
		return nil, errors.New("func GenerateDayReport() GetDayReport return nil")
	}

	// 进行进一步处理
	// 1. nytime需要移除所有标题中还有Briefing的，并加入破解
	newNytNews := []spider.NYTimesRssItem{}
	for _, news := range report.NytNews {
		if !strings.Contains(news.Title, "Briefing") {
			newNytNews = append(newNytNews, news)
		}
	}
	report.NytNews = newNytNews
	for i, news := range report.NytNews {
		report.NytNews[i].Link = "https://www.removepaywall.com/search?url=" + news.Link
	}
	// 2. 调用ai进行翻译
	err = translate(report)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GenerateDayReport() translate error"), err))
	}
	// 3. 生成摘要
	err = summary(report)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GenerateDayReport() summary error"), err))
	}
	// 4. 存储
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

func getOpenAIConfig(scene backendshare.AIScene, fallbackMode ai.ModelMode) (base, token string, modelPools map[ai.ModelMode][]string, mode ai.ModelMode, err error) {
	conf, err := backendshare.GetAIConfig(setting.GCfg)
	if err != nil {
		return "", "", nil, fallbackMode, err
	}
	if conf.Base == "" || conf.Base == "need input" {
		return "", "", nil, fallbackMode, errors.New("openai.base is empty")
	}
	if conf.Token == "" || conf.Token == "need input" {
		return "", "", nil, fallbackMode, errors.New("openai.token is empty")
	}
	return conf.Base, conf.Token, conf.ModelPools, conf.ModeForScene(scene, fallbackMode), nil
}

func translateContent(chat *ai.OpenAI, content string) (string, error) {
	const transPromt = "仅返回以下文字的简体中文翻译，无需翻译则原样返回：\n"
	translated, err := chat.Chat(transPromt + content)
	if err != nil {
		// 二次尝试
		time.Sleep(time.Duration(rand.Float64() * 0.1 * float64(time.Second)))
		var retryErr error
		translated, retryErr = chat.Chat(transPromt + content)
		if retryErr != nil {
			return "", retryErr
		}
	}
	return translated, nil
}

func translateNews(newsBBC []spider.BBCRssItem, newsNYT []spider.NYTimesRssItem, chat *ai.OpenAI) error {
	var wg sync.WaitGroup
	errChan := make(chan error, len(newsBBC)+len(newsNYT)*2) // 用于接收翻译错误

	// 翻译 BBC 新闻
	for i := range newsBBC {
		wg.Add(1)

		time.Sleep(time.Duration(rand.Float64() * 0.1 * float64(time.Second)))

		go func(i int) {
			defer wg.Done()
			// 翻译标题
			translatedTitle, err := translateContent(chat, newsBBC[i].Title)
			if err != nil {
				errChan <- errors.Join(errors.New("func translate() translate title error"), err)
				return
			}
			newsBBC[i].Title = translatedTitle

			// 翻译描述
			translatedDescription, err := translateContent(chat, newsBBC[i].Description)
			if err != nil {
				errChan <- errors.Join(errors.New("func translate() translate description error"), err)
				return
			}
			newsBBC[i].Description = translatedDescription
		}(i)
	}

	// 翻译 NYT 新闻
	for i := range newsNYT {
		wg.Add(1)

		time.Sleep(time.Duration(rand.Float64() * 0.1 * float64(time.Second)))

		go func(i int) {
			defer wg.Done()
			// 翻译标题
			translatedTitle, err := translateContent(chat, newsNYT[i].Title)
			if err != nil {
				errChan <- errors.Join(errors.New("func translate() translate title error"), err)
				return
			}
			newsNYT[i].Title = translatedTitle

			// 翻译描述
			translatedDescription, err := translateContent(chat, newsNYT[i].Description)
			if err != nil {
				errChan <- errors.Join(errors.New("func translate() translate description error"), err)
				return
			}
			newsNYT[i].Description = translatedDescription
		}(i)
	}

	// 等待所有 goroutines 完成
	wg.Wait()
	close(errChan)

	// 检查是否有错误
	if len(errChan) > 0 {
		return <-errChan // 返回第一个错误
	}

	return nil
}

func summary(report *DayReport) error {
	setDayDigestFailure(report)

	base, token, modelPools, mode, err := getOpenAIConfig(backendshare.AISceneSummary, ai.ModelModeCheap)
	if err != nil {
		return err
	}

	chat := ai.NewOpenAIWithMode(base, token, mode, modelPools)
	if chat == nil {
		return errors.New("NewOpenAI error")
	}

	digest, err := generateDayDigest(report, chat)
	if err != nil {
		return err
	}

	report.Digest = digest
	report.Summary = buildSummaryFromDigest(digest)
	return nil
}

func setDayDigestFailure(report *DayReport) {
	if report == nil {
		return
	}
	report.Digest = nil
	report.Summary = dayDigestFailureSummary
}

func translate(report *DayReport) error {
	// 获取配置
	base, token, modelPools, mode, err := getOpenAIConfig(backendshare.AISceneTranslate, ai.ModelModeCheap)
	if err != nil {
		return err
	}

	// 创建 OpenAI 实例
	chat := ai.NewOpenAIWithMode(base, token, mode, modelPools)
	if chat == nil {
		return errors.New("NewOpenAI error")
	}

	// 翻译 DayReport 的新闻
	if err := translateNews(report.BbcNews, report.NytNews, chat); err != nil {
		return err
	}

	return nil
}

func translateW(report *WholeReport) error {
	// 获取配置
	base, token, modelPools, mode, err := getOpenAIConfig(backendshare.AISceneTranslate, ai.ModelModeCheap)
	if err != nil {
		return err
	}

	// 创建 OpenAI 实例
	chat := ai.NewOpenAIWithMode(base, token, mode, modelPools)
	if chat == nil {
		return errors.New("NewOpenAI error")
	}

	// 翻译 WholeReport 的新闻
	if err := translateNews(report.BbcNews, report.NytNews, chat); err != nil {
		return err
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
	// TODO: 日后可以做成配置的基础url方便别人用
	reportLink := fmt.Sprintf("[点击查看日报](https://plat.intmian.com/day-report/%s)", time.Now().Format("2006-01-02"))
	pushContent := buildDailyPushMarkdown(report, todayStr, reportLink)
	err = tool.GPush.Push("日报", pushContent, true)
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

	// 代理
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

	// 优先调用缓存
	timeStr := time.Now().Format("2006-01-02")
	cachedReport := &WholeReport{}
	err = d.dayReportStorage.GetFromJson(timeStr+"_whole", cachedReport)
	if err == nil {
		return cachedReport, nil
	}
	if !errors.Is(err, xstorage.ErrNoData) {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GetWholeReport() GetFromJson error"), err))
		return nil, errors.Join(errors.New("func GetWholeReport() GetFromJson error"), err)
	}

	// 获取全量日报
	report, err := getWholeReport(client, keys)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GetWholeReport() getWholeReport error"), err))
	}

	// 存储全量日报和日期
	err = d.dayReportStorage.SetToJson(timeStr+"_whole", report)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func GetWholeReport() SetToJson error"), err))
		return nil, errors.Join(errors.New("func GetWholeReport() SetToJson error"), err)
	}

	return report, nil
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
