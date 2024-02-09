package backend

import "github.com/intmian/platform/backend/tool"

func Init() {
	GPlatCore = &PlatCore{}
	tool.Init()
	err := GPlatCore.Init()
	if err != nil {
		panic(err)
	}
	GWebMgr.Init()
}
