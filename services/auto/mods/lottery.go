package mods

import (
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/platform/services/auto/tool"
)

type Lottery struct {
}

func (l *Lottery) Init() {
}

func (l *Lottery) Do() {
	lotteries := spider.GetLotteryNow()
	if lotteries == nil {
		tool.GLog.Warning(l.GetName(), "接口失效")
		return
	}
	s := spider.ParseLotteriesToMarkDown(lotteries)
	err := tool.GPush.Push("彩票", s, true)
	if err != nil {
		tool.GLog.WarningErr(l.GetName(), err)
	}
}

func (l *Lottery) GetName() string {
	return "auto.LOTTERY"
}

func (l *Lottery) GetInitTimeStr() string {
	return "0 0 22 * * ?"
}
