package main

import (
	"github.com/intmian/platform/backend/core"
)

func main() {
	if err := core.Init(); err != nil {
		panic(err)
	}
	core.Init()
	core.GPlatCore.Update()
}
