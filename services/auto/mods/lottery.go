package mods

import (
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/platform/services/auto/tool"
)

type Lottery struct {
}

func (l *Lottery) Init() {
}

func (l *Lottery) Do() {
	lotteries := spider.GetLotteryNow()
	if lotteries == nil {
		tool.GLog.Log(xlog.EWarning, l.GetName(), "接口失效")
		return
	}
	s := spider.ParseLotteriesToMarkDown(lotteries)
	tool.GPush.PushPushDeer("彩票", s, true)
}

func (l *Lottery) GetName() string {
	return "LOTTERY"
}

func (l *Lottery) GetInitTimeStr() string {
	return "0 0 22 * * ?"
}
