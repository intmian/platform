package tool

import "github.com/intmian/platform/core"

type tool struct {
	flag2name map[core.SvrFlag]core.SvrName
	name2flag map[core.SvrName]core.SvrFlag
}

var gTool tool

func Init() {
	gTool.flag2name = make(map[core.SvrFlag]core.SvrName)
	gTool.name2flag = make(map[core.SvrName]core.SvrFlag)
	gTool.flag2name[core.FlagAuto] = core.NameAuto
	gTool.flag2name[core.FlagNote] = core.NameNote
	// 新增服务要在这里注册
	for k, v := range gTool.flag2name {
		gTool.name2flag[v] = k
	}
}

func GetFlag(name core.SvrName) core.SvrFlag {
	return gTool.name2flag[name]
}

func GetName(flag core.SvrFlag) core.SvrName {
	return gTool.flag2name[flag]
}

func GetStatusStr(status core.ServiceStatus) string {
	switch status {
	case core.StatusStart:
		return "start"
	case core.StatusStop:
		return "stop"
	default:
		return "unknown"
	}
}
