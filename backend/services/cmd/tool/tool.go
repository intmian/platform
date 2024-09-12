package tool

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"io"
	"net/url"
	"os"
	"time"
)

type ToolData struct {
	Name      string
	Typ       ToolType
	Created   time.Time
	Updated   time.Time
	githubUrl url.URL
	Addr      string
}

type ToolInit struct {
	ID       string
	storage  *xstorage.XStorage
	initData *ToolData
}

type Tool struct {
	ToolInit
	ToolData
	init misc.InitTag
}

func (t *Tool) Init(init ToolInit) error {
	// 处理外部
	if t.init.IsInitialized() {
		return errors.New("already initialized")
	}
	t.ToolInit = init

	// 处理数据
	if init.initData != nil {
		t.ToolData = *init.initData
	} else {
		err := t.Load()
		if err != nil {
			return errors.New("load tool data failed")
		}
	}
	// 处理别的
	t.init.SetInitialized()
	return nil
}

func NewTool(init ToolInit) (*Tool, error) {
	t := &Tool{}
	err := t.Init(init)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (t *Tool) Save() error {
	err := t.storage.SetToJson(xstorage.Join("CMD", "toolMgr", "tool", t.ID), t.ToolData)
	if err != nil {
		return errors.Join(errors.New("save tool data failed"), err)
	}
	return nil
}

func (t *Tool) Load() error {
	err := t.storage.GetFromJson(xstorage.Join("CMD", "toolMgr", "tool", t.ID), &t.ToolData)
	if err != nil && !errors.Is(err, xstorage.ErrNoData) {
		return errors.Join(errors.New("get tool data failed"), err)
	}
	return nil
}

// TODO: 实现外部传入的文件与github相关的处理
// TODO: 实现多文件体系，如何多文件的执行python脚本并确定入口并在外部可以引用

func (t *Tool) GetName() string {
	return t.Name
}

func (t *Tool) GetAddr() string {
	return t.Addr
}

func (t *Tool) GetContent() string {
	file, err := os.Open(t.Addr)
	if err != nil {
		return ""
	}
	defer file.Close()
	all, err := io.ReadAll(file)
	if err != nil {
		return ""
	}
	return string(all)
}

func (t *Tool) SetContent(content string) error {
	if IsToolTypeScript(t.Typ) {
		return errors.New("tool type is not script")
	}
	file, err := os.Create(t.Addr)
	if err != nil {
		return errors.Join(errors.New("create file failed"), err)
	}
	defer file.Close()
	_, err = file.WriteString(content)
	if err != nil {
		return errors.Join(errors.New("write file failed"), err)
	}
	return nil
}

func (t *Tool) Rename(name string) error {
	t.Name = name
	return t.Save()
}
