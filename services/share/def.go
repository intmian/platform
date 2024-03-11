package share

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/share"
	"reflect"
)

// ServiceShare 服务共享的资源
// 例如配置、日志、推送、存储等等
type ServiceShare struct {
	Log          *xlog.XLog                                           // 共用的日志服务
	Push         *xpush.XPush                                         // 共用的推送服务
	Storage      *xstorage.XStorage                                   // 共用的存储服务，如果有自己私有的数据，在用户内部自己起一个
	CallOther    func(to share.SvrFlag, msg Msg) error                // 向别的服务发送请求，可能没有返回值或者通过msg返回
	CallOtherRpc func(to share.SvrFlag, msg Msg) (interface{}, error) // 向别的服务发送rpc请求
	BaseSetting  share.BaseSetting
	Ctx          context.Context
}

type Msg struct {
	cmd     string
	data    interface{}
	dataStr string
}

func MakeMsg(cmd string, data interface{}) Msg {
	return Msg{
		cmd:  cmd,
		data: data,
	}
}

func MakeMsgJson(cmd string, dataStr string) Msg {
	return Msg{
		cmd:     cmd,
		dataStr: dataStr,
	}
}

func (m *Msg) Cmd() string {
	return m.cmd
}

func (m *Msg) Data(bind interface{}) error {
	// 判断是否为指针
	if reflect.TypeOf(bind).Kind() != reflect.Ptr {
		return errors.New("bind is not pointer")
	}
	if m.dataStr != "" {
		return json.Unmarshal([]byte(m.dataStr), bind)
	} else {
		// 使用反射进行赋值
		reflect.ValueOf(bind).Elem().Set(reflect.ValueOf(m.data))
		return nil
	}
}

type IService interface {
	Start(share ServiceShare) error
	Stop() error
	Handle(msg Msg, valid share.Valid) error
	HandleRpc(msg Msg, valid share.Valid) (interface{}, error)
}
