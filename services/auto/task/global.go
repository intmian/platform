package task

import "github.com/intmian/platform/services/auto/mods"

var GMgr = NewMgr()

func Init() {
	GMgr.Add(&mods.Dapan{})
	GMgr.Add(&mods.Lottery{})
	GMgr.Add(&mods.Baidu{})
	//GMgr.Add(&mods.GNews{})
	GMgr.Add(&mods.Day{})
}
