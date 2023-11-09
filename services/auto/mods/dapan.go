package mods

import (
	"github.com/intmian/mian_go_lib/tool/spider"
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/platform/services/auto/tool"
)

type Dapan struct {
}

func (d *Dapan) Init() {

}

func (d *Dapan) Do() {
	price, inc, radio := spider.GetDapan000001()
	if price == "" || inc == "" || radio == "" {
		tool.GLog.Log(xlog.EWarning, d.GetName(), "GetDapan000001 error")
		return
	}
	s := spider.ParseDapanToMarkdown("上证指数", price, inc, radio)
	tool.GPush.PushPushDeer("大盘", s, true)
}

func (d *Dapan) GetName() string {
	return "auto.DAPAN"
}

func (d *Dapan) GetInitTimeStr() string {
	return "0 10 15 * * ?"
}
