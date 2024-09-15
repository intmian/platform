package run

import (
	"context"
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/multi"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/cmd/tool"
	"os"
	"path"
	"strconv"
)

type EnvInit struct {
	storage *xstorage.XStorage
	log     *xlog.XLog
	ctx     context.Context
	addr    string
	ID      uint32

	initData *EnvData
}

type EnvData struct {
	// 先简单加一组sting作为命令行参数。
	param         []string
	defaultToolID string
	note          string
}

/*
Env 执行环境
允许外层使用tool创建task
task也由env管理
创建task时允许添加一组参数，也可以存储一组默认参数
支持创建并修改根目录的文件（配置、日志 etc）
TODO: 目前仅支持修改读取文本文件
TODO: 目前仅支持根目录的文件读取修改
*/
type Env struct {
	EnvInit
	EnvData

	tasks multi.SafeArr[*Task]
	f     *misc.FileNode
}

func (e *Env) Init(init EnvInit) error {
	if e.EnvInit.storage != nil {
		return errors.New("already initialized")
	}
	e.EnvInit = init
	if init.initData != nil {
		err := e.Load()
		if err != nil {
			return errors.New("load env data failed")
		}
	}

	// 建立文件夹，如果文件夹不存在
	if _, err := os.Stat(init.addr); os.IsNotExist(err) {
		err := os.MkdirAll(init.addr, os.ModePerm)
		if err != nil {
			return errors.New("create env dir failed")
		}
	}

	// 扫码文件夹
	f, err := misc.GetFileTree(init.addr)
	if err != nil {
		return errors.New("get file tree failed")
	}
	e.f = &f
	return nil
}

func NewEnv(init EnvInit) (*Env, error) {
	e := &Env{}
	err := e.Init(init)
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (e *Env) Save() error {
	err := e.storage.SetToJson(xstorage.Join("runmgr", "env", strconv.Itoa(int(e.ID))), e.EnvData)
	if err != nil {
		return errors.New("set to json failed")
	}
	return nil
}

func (e *Env) Load() error {
	err := e.storage.GetFromJson(xstorage.Join("runmgr", "env", strconv.Itoa(int(e.ID))), &e.EnvData)
	if err != nil {
		return errors.New("get from json failed")
	}
	return nil
}

func (e *Env) GetDirFile() []string {
	res := make([]string, 0)
	for _, v := range e.f.Children {
		res = append(res, v.File.Name)
	}
	return res
}

func (e *Env) UpdateTxtFile(name string, content string) error {
	find := false
	for _, v := range e.f.Children {
		if v.File.Name == name {
			find = true
			break
		}
	}
	if !find {
		err := e.f.File.MakeChildEmptyFile(name, false)
		if err != nil {
			return errors.New("make child empty file failed")
		}
	}
	// 覆盖文件
	err := os.WriteFile(path.Join(e.addr, name), []byte(content), os.ModePerm)
	if err != nil {
		return errors.New("write file failed")
	}
	return nil
}

func (e *Env) GetTxtFile(name string) (string, error) {
	for _, v := range e.f.Children {
		if v.File.Name == name {
			cont, err := os.ReadFile(path.Join(e.addr, name))
			if err != nil {
				return "", errors.New("read file failed")
			}
			return string(cont), nil
		}
	}
	return "", errors.New("file not exist")
}

func (e *Env) RunTask(t *tool.Tool, param []string) error {
	task := NewTask(TaskInit{
		tool:  t,
		param: param,
		env:   e,
		ctx:   context.WithoutCancel(e.ctx),
	})
	e.tasks.Append(task)
	err := task.Run()
	if err != nil {
		return errors.Join(errors.New("task run failed"), err)
	}
	return nil
}

func (e *Env) GetTaskLen() int {
	return e.tasks.Len()
}

func (e *Env) GetTask(index int) *Task {
	task, _ := e.tasks.Get(index)
	return task
}

func (e *Env) DelTask(index int) error {
	task, ok := e.tasks.Get(index)
	if !ok {
		return errors.New("task not exist")
	}
	task.end()
	return nil
}

func (e *Env) SetDefaultTool(id string) {
	e.defaultToolID = id
	err := e.Save()
	if err != nil {
		e.log.WarningErr("ENV", errors.Join(errors.New("set default tool failed"), err))
	}
}

func (e *Env) SetNote(note string) {
	e.note = note
	err := e.Save()
	if err != nil {
		e.log.WarningErr("ENV", errors.Join(errors.New("set note failed"), err))
	}
}

func (e *Env) SetParam(param []string) {
	e.param = param
	err := e.Save()
	if err != nil {
		e.log.WarningErr("ENV", errors.Join(errors.New("set param failed"), err))
	}
}
