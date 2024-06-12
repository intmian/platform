package main

import (
	"context"
	"github.com/intmian/platform/backend/platform"
)

func main() {
	var plat platform.PlatForm
	err := plat.Init(context.Background())
	if err != nil {
		panic(err)
	}
	plat.Run()
}
