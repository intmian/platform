package main

import (
	"github.com/intmian/platform/core"
	"github.com/intmian/platform/web"
)

func main() {
	core.Init()
	web.Init()
	core.GPlatCore.Update()
}
