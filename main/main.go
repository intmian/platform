package main

import (
	"github.com/intmian/platform/core"
	"github.com/intmian/platform/global"
	"github.com/intmian/platform/web"
)

func main() {
	if err := global.Init(); err != nil {
		panic(err)
	}
	core.Init()
	web.Init()
	core.GPlatCore.Update()
}
