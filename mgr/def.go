package mgr

import (
	"github.com/intmian/platform/services/share"
)

type (
	// baseSetting 一些最基础的配置，
	// 复杂的或者需要热更的请使用xstorage
	baseSetting struct {
		PlatName string `json:"plat_name"` // 平台名称，会被使用在日志和推送中

	}
)

type (
	SvrFlag int
	Service struct {
		name SvrName
		svr  share.Service
	}
)

type SvrName string

const (
	AutoName SvrName = "auto"
	NoteName SvrName = "note"
)

const (
	FLAG_NONE SvrFlag = iota
	FLAG_AUTO
	FLAG_NOTE
)
