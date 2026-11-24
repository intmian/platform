package mods

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// 日报开头的问候：卡片标题"日安～ 11月24日 周二 ☀️"，天气行后面跟一句贴心话。
// 全部按天气和星期规则生成，不调用 AI，没有额外成本。

var weekdayNames = []string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}

// weatherEmoji 按天气文字挑一个图标，先判断雨雪这类更要紧的。
func weatherEmoji(text string) string {
	switch {
	case strings.Contains(text, "雷"):
		return "⛈️"
	case strings.Contains(text, "雪"):
		return "❄️"
	case strings.Contains(text, "雨"):
		return "🌧️"
	case strings.Contains(text, "雾"), strings.Contains(text, "霾"), strings.Contains(text, "沙"):
		return "🌫️"
	case strings.Contains(text, "晴") && strings.Contains(text, "云"):
		return "🌤️"
	case strings.Contains(text, "晴"):
		return "☀️"
	case strings.Contains(text, "多云"):
		return "⛅"
	case strings.Contains(text, "阴"):
		return "☁️"
	default:
		return "🌤️"
	}
}

// greetingTip 是天气行后面的一句话：先看天气有没有要提醒的，没有再按星期说点轻松的。
func greetingTip(report *DayReport, now time.Time) string {
	if report != nil && len(report.Weather.Daily) > 0 {
		w := report.Weather.Daily[0]
		text := w.TextDay + w.TextNight
		tempMax, errMax := strconv.Atoi(strings.TrimSpace(w.TempMax))
		tempMin, errMin := strconv.Atoi(strings.TrimSpace(w.TempMin))
		hasTemp := errMax == nil && errMin == nil
		switch {
		case strings.Contains(text, "雪"):
			return "下雪啦，路上慢一点"
		case strings.Contains(text, "雨"):
			return "出门记得带伞 ☂️"
		case hasTemp && tempMin <= 0:
			return "好冷，围巾手套带上 🧣"
		case hasTemp && tempMax >= 33:
			return "好热，记得多喝水"
		case hasTemp && tempMax-tempMin >= 10:
			return "早晚温差大，带件外套"
		}
	}
	switch now.Weekday() {
	case time.Saturday, time.Sunday:
		return "周末愉快～"
	case time.Friday:
		return "周五啦，再坚持一下"
	case time.Monday:
		return "新的一周，慢慢来"
	default:
		return "今天也要元气满满"
	}
}

// dailyPushTitle 是飞书卡片的标题，例如"日安～ 11月24日 周二 ☀️"。
func dailyPushTitle(report *DayReport, now time.Time) string {
	title := fmt.Sprintf("日安～ %s %s", now.Format("1月2日"), weekdayNames[now.Weekday()])
	if report != nil && len(report.Weather.Daily) > 0 {
		title += " " + weatherEmoji(report.Weather.Daily[0].TextDay)
	}
	return title
}
