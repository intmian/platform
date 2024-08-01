package runmgr

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/cmd/toolmgr"
	"strconv"
)

type EnvInit struct {
	storage *xstorage.XStorage
	log     *xlog.XLog
	addr    string
	id      uint32
}

type EnvData struct {
	toolType toolmgr.ToolType
}

type Env struct {
	EnvInit
	EnvData

	f *misc.FileNode
}

func (e *Env) Init(init EnvInit) error {
	if e.EnvInit.storage != nil {
		return errors.New("already initialized")
	}
	e.EnvInit = init
	err := e.Load()
	if err != nil {
		return errors.New("load env data failed")
	}
	return nil
}

func (e *Env) Save() error {
	err := e.storage.SetToJson(xstorage.Join("runmgr", "env", strconv.Itoa(int(e.id))), e.EnvData)
	if err != nil {
		return errors.New("set to json failed")
	}
	return nil
}

func (e *Env) Load() error {
	err := e.storage.GetFromJson(xstorage.Join("runmgr", "env", strconv.Itoa(int(e.id))), &e.EnvData)
	if err != nil {
		return errors.New("get from json failed")
	}
	return nil
}
