package share

import (
	"time"
)

type (
	// BaseSetting 一些最基础的配置，基本上都是启动时候就需要的
	// 复杂的或者需要热更的请使用xstorage
	BaseSetting struct {
		PlatName       string `toml:"plat_name"`       // 平台名称，会被使用在日志和推送中
		DBAddr         string `toml:"db_addr"`         // 数据库地址，会被用在xstorage中
		LogAddr        string `toml:"log_addr"`        // 日志地址，
		DingDingToken  string `toml:"dingding_token"`  // 钉钉token
		DingDingSecret string `toml:"dingding_secret"` // 钉钉secret
		UseFront       bool   `toml:"use_front"`       // 是否使用前端
		GinDebug       bool   `toml:"gin_debug"`       // 是否使用gin的debug模式
		AdminPwd       string `toml:"admin_pwd"`       // 管理员密码
		WebPort        string `toml:"web_port"`        // web端口
		Debug          bool   `toml:"debug"`           // 是否开启debug模式
	}
)

type (
	SvrFlag int
)

type SvrName string

const (
	NameAuto    SvrName = "auto"
	NameNote    SvrName = "note"
	NameAccount SvrName = "account"
	NameCmd     SvrName = "cmd"
)

const (
	FlagNone SvrFlag = iota
	FlagAuto
	FlagNote
	FlagAccount
	FlagCmd
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

type ServicesInfo struct {
	Name      string
	Status    string
	StartTime string
	Props     int
}

type Setting struct {
	WebPort string
}

type Permission string

const (
	PermissionAdmin      Permission = "admin"
	PermissionCmd        Permission = "cmd"
	PermissionAuto       Permission = "auto"
	PermissionAutoReport Permission = "auto_report"
)

type Valid struct {
	FromSys     bool // 代表是由系统发起的请求，不需要验证
	User        string
	Permissions []Permission
	ValidTime   int64
}

func (v *Valid) GetFrom() string {
	if v.FromSys {
		return "sys"
	}
	return v.User
}

func (v *Valid) HasPermission(name Permission) bool {
	if v.FromSys {
		return true
	}
	if v.ValidTime < time.Now().Unix() {
		return false
	}
	for _, p := range v.Permissions {
		if p == name {
			return true
		}

	}
	return false
}

func (v *Valid) HasOnePermission(names ...Permission) bool {
	if v.FromSys {
		return true
	}
	if v.ValidTime < time.Now().Unix() {
		return false
	}
	for _, p := range v.Permissions {
		for _, name := range names {
			if p == name {
				return true
			}
		}
	}
	return false
}

func (v *Valid) HasAllPermission(names ...Permission) bool {
	if v.FromSys {
		return true
	}
	if v.ValidTime < time.Now().Unix() {
		return false
	}
	for _, name := range names {
		if !v.HasPermission(name) {
			return false
		}
	}
	return true
}

func MakeSysValid() Valid {
	return Valid{
		FromSys: true,
	}
}
