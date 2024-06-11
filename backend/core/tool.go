package core

import (
	"github.com/intmian/platform/backend/share"
	"strings"
)

type tool struct {
	flag2name map[share.SvrFlag]share.SvrName
	name2flag map[share.SvrName]share.SvrFlag
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
