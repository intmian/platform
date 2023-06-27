package task

import "github.com/intmian/platform/services/auto/mods"

var GMgr = NewMgr()

func Init() {
	GMgr.Add(&mods.Baidu{})
	GMgr.Add(&mods.Dapan{})
	GMgr.Add(&mods.Lottery{})
}
