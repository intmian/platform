package share

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"

	"github.com/intmian/mian_go_lib/xbi"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xstorage"
)

// ServiceShare 服务共享的资源
// 例如配置、日志、推送、存储等等
type ServiceShare struct {
	Log          *xlog.XLog                                     // 共用的日志服务
	Push         *xpush.XPush                                   // 共用的推送服务
	Storage      *xstorage.XStorage                             // 共用的存储服务，如果有自己私有的数据，在用户内部自己起一个
	Cfg          *xstorage.CfgExt                               // 共用的配置服务
	Bi           *xbi.XBi                                       // 公用的日志服务
	CallOther    func(to SvrFlag, msg Msg)                      // 向别的服务发送请求，可能没有返回值或者通过msg返回，错误也自己处理吧
	CallOtherRpc func(to SvrFlag, msg Msg) (interface{}, error) // 向别的服务发送rpc请求
	BaseSetting  BaseSetting
	Ctx          context.Context
}

type Msg struct {
	cmd     Cmd
	data    interface{}
	dataStr string
}

type ServiceProp uint32

const (
	// SvrPropNull 服务的属性
	SvrPropNull ServiceProp = 1 << iota
	// SvrPropCore 核心服务
	SvrPropCore
	// SvrPropCoreOptional 可选的核心服务
	SvrPropCoreOptional
	// SvrPropMicro 微服务
	SvrPropMicro
)

func MakeMsg(cmd Cmd, data interface{}) Msg {
	return Msg{
		cmd:  cmd,
		data: data,
	}
}

func MakeMsgJson(cmd Cmd, dataStr string) Msg {
	return Msg{
		cmd:     cmd,
		dataStr: dataStr,
	}
}

func (m *Msg) Cmd() Cmd {
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

type DebugParams struct {
	IntParams DebugParam[int]
	StrParams DebugParam[string]
	F64Params DebugParam[float64]
}

type DebugParam[T comparable] struct {
	params []T
}

func (d *DebugParam[T]) Get(index int) T {
	var zero T
	if index < 0 || index >= len(d.params) {
		return zero
	}
	return d.params[index]
}

func (d *DebugParam[T]) Set(index int, value T) {
	var zero T
	if index < 0 {
		return
	}
	for index >= len(d.params) {
		d.params = append(d.params, zero)
	}
	d.params[index] = value
}

func (d *DebugParam[T]) Len() int {
	return len(d.params)
}

func (d *DebugParam[T]) Append(value ...T) {
	d.params = append(d.params, value...)
}

func (d *DebugParam[T]) GetAll() []T {
	return d.params
}

type DebugReq struct {
	Cmd    string
	Params DebugParams
}

type DebugRet struct {
	Params DebugParams
}

type IService interface {
	Start(share ServiceShare) error
	Stop() error
	Handle(msg Msg, valid Valid)
	HandleRpc(msg Msg, valid Valid) (interface{}, error)
	GetProp() ServiceProp
	DebugCommand(req DebugReq) interface{}
}

type Cmd string

func HandleRpcTool[ReqT any, RetT any](name string, msg Msg, valid Valid, handle func(Valid, ReqT) (RetT, error)) (RetT, error) {
	var req ReqT
	var ret RetT
	err := msg.Data(&req)
	if err != nil {
		return ret, errors.Join(err, errors.New(name+" data err"))
	}
	ret, err = handle(valid, req)
	if err != nil {
		return ret, errors.Join(err, errors.New(name+" handle err"))
	}
	return ret, nil
}
