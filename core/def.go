package core

import "time"

type (
	// baseSetting 一些最基础的配置，
	// 复杂的或者需要热更的请使用xstorage
	baseSetting struct {
		PlatName       string `json:"plat_name"`       // 平台名称，会被使用在日志和推送中
		DBAddr         string `json:"db_addr"`         // 数据库地址，会被用在xstorage中
		LogAddr        string `json:"log_addr"`        // 日志地址，
		DingDingToken  string `json:"dingding_token"`  // 钉钉token
		DingDingSecret string `json:"dingding_secret"` // 钉钉secret
	}
)

type (
	SvrFlag int
)

type SvrName string

const (
	NameAuto SvrName = "auto"
	NameNote SvrName = "note"
)

const (
	FlagNone SvrFlag = iota
	FlagAuto
	FlagNote
)

type ServiceStatus int

const (
	StatusStop ServiceStatus = iota
	StatusStart
)

type ServiceMeta struct {
	StartTime time.Time
	Status    ServiceStatus
}
