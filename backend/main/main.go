package main

import (
	"github.com/intmian/platform/backend"
	"github.com/intmian/platform/backend/global"
)

func main() {
	if err := global.Init(); err != nil {
		panic(err)
	}
	backend.Init()
	backend.Init()
	backend.GPlatCore.Update()
}
