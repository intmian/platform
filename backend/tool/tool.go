package tool

import (
	"github.com/intmian/platform/backend/share"
	"strings"
)

type tool struct {
	flag2name map[share.SvrFlag]share.SvrName
	name2flag map[share.SvrName]share.SvrFlag
}

var gTool tool

func Init() {
	gTool.flag2name = make(map[share.SvrFlag]share.SvrName)
	gTool.name2flag = make(map[share.SvrName]share.SvrFlag)
	gTool.flag2name[share.FlagAuto] = share.NameAuto
	gTool.flag2name[share.FlagNote] = share.NameNote
	gTool.flag2name[share.FlagAccount] = share.NameAccount
	// 新增服务要在这里注册
	for k, v := range gTool.flag2name {
		gTool.name2flag[v] = k
	}
}

func GetFlag(name share.SvrName) share.SvrFlag {
	return gTool.name2flag[name]
}

func GetName(flag share.SvrFlag) share.SvrName {
	return gTool.flag2name[flag]
}

func GetStatusStr(status share.ServiceStatus) string {
	switch status {
	case share.StatusStart:
		return "start"
	case share.StatusStop:
		return "stop"
	default:
		return "unknown"
	}
}

func GetStr2Permission(strs ...string) share.Permission {
	var buffer strings.Builder
	for i, s := range strs {
		buffer.WriteString(s)
		if i != len(strs)-1 {
			buffer.WriteString(".")
		}
	}
	return share.Permission(buffer.String())
}
