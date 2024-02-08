package share

import "time"

type (
	// BaseSetting 一些最基础的配置，TODO: 需要迁移到global和比的一起
	// 复杂的或者需要热更的请使用xstorage
	BaseSetting struct {
		PlatName       string `toml:"plat_name"`       // 平台名称，会被使用在日志和推送中
		DBAddr         string `toml:"db_addr"`         // 数据库地址，会被用在xstorage中
		LogAddr        string `toml:"log_addr"`        // 日志地址，
		DingDingToken  string `toml:"dingding_token"`  // 钉钉token
		DingDingSecret string `toml:"dingding_secret"` // 钉钉secret
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
