package platform

import (
	"github.com/intmian/platform/backend/share"
	"strings"
)

// 存储一些优化混存数据与通用工具

type tool struct {
	flag2name map[share.SvrFlag]share.SvrName
	name2flag map[share.SvrName]share.SvrFlag
}

func getStatusStr(status share.ServiceStatus) string {
	switch status {
	case share.StatusStart:
		return "start"
	case share.StatusStop:
		return "stop"
	default:
		return "unknown"
	}
}

func getStr2Permission(strs ...string) share.Permission {
	var buffer strings.Builder
	for i, s := range strs {
		buffer.WriteString(s)
		if i != len(strs)-1 {
			buffer.WriteString(".")
		}
	}
	return share.Permission(buffer.String())
}

type uniReturn struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data"`
}

func makeSErrReturn(code int, msg string) uniReturn {
	return uniReturn{
		Code: code,
		Msg:  msg,
	}
}

func makeErrReturn(msg string) uniReturn {
	return uniReturn{
		Code: 1,
		Msg:  msg,
	}
}

func makeOkReturn(data interface{}) uniReturn {
	return uniReturn{
		Code: 0,
		Data: data,
	}
}
