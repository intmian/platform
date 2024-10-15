package tool

import (
	"errors"
	"fmt"
	"github.com/bwmarrin/snowflake"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/multi"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xstorage"
	"net/url"
	"os"
	"path"
	"time"
)

// toolMgrData 用于在重启后恢复数据。线程不安全
type toolMgrData struct {
	ToolIDs multi.SafeArr[string]
}

// ToolMgrInit 外部依赖
type ToolMgrInit struct {
	Storage   *xstorage.XStorage
	ScriptDir string // 脚本的实际存储地址
	Log       *xlog.XLog
}

type ToolMgr struct {
	ToolMgrInit
	toolMgrData
	storage *xstorage.XStorage
	id2tool multi.SafeMap[string, *Tool]
	init    misc.InitTag
	node    *snowflake.Node
}

func NewToolMgr(init ToolMgrInit) (*ToolMgr, error) {
	mgr := &ToolMgr{}
	err := mgr.Init(init)
	if err != nil {
		return nil, errors.Join(errors.New("init toolMgr failed"), err)
	}
	return mgr, nil
}

func (m *ToolMgr) Init(init ToolMgrInit) error {
	if m.init.IsInitialized() {
		return errors.New("already initialized")
	}
	m.ToolMgrInit = init
	m.storage = init.Storage
	node, err := snowflake.NewNode(1)
	if err != nil {
		return errors.Join(errors.New("create snowflake node failed"), err)
	}
	m.node = node
	err = m.Load()
	if err != nil {
		return errors.New("load toolMgr data failed")
	}
	m.ToolIDs.SafeUse(func(arr []string) {
		for _, id := range arr {
			tool, err := NewTool(ToolInit{
				ID:      id,
				storage: m.storage,
			})
			if err != nil {
				m.Log.WarningErr("ToolMgr", errors.Join(errors.New(fmt.Sprintf("new tool failed, id: %s", id)), err))
				continue
			}
			err = m.register(id, tool)
			if err != nil {
				m.Log.WarningErr("ToolMgr", errors.Join(errors.New("register tool failed"), err))
				continue
			}
		}
	})

	m.init.SetInitialized()
	return nil
}

func (m *ToolMgr) SaveToolIDs() error {
	err := m.storage.SetToJson(xstorage.Join("CMD", "toolMgr", "toolIDs"), m.ToolIDs.Copy())
	if err != nil {
		return errors.Join(errors.New("save toolIDs failed"), err)
	}
	return nil
}

func (m *ToolMgr) Load() error {
	var data []string
	err := m.storage.GetFromJson(xstorage.Join("CMD", "toolMgr", "toolIDs"), &data)
	if err != nil && !errors.Is(err, xstorage.ErrNoData) {
		return errors.Join(errors.New("get toolIDs failed"), err)
	}
	m.ToolIDs = *multi.NewSafeArr(data)
	return nil
}

func (m *ToolMgr) CreateTool(name string, typ ToolType, script string) error {
	if !m.init.IsInitialized() {
		return misc.ErrNotInit
	}
	if !IsToolTypeScript(typ) {
		return errors.New("invalid tool type")
	}
	if name == "" {
		return errors.New("invalid Name")
	}

	id := m.node.Generate().String()
	m.ToolIDs.Append(id)
	err := m.SaveToolIDs()
	if err != nil {
		return errors.Join(errors.New("save toolIDs failed"), err)
	}

	// 创建ID对应的文件夹
	err = misc.CreateDirWhenNotExist(path.Join(m.ScriptDir, id))
	if err != nil {
		return errors.Join(errors.New("create script dir failed"), err)
	}
	// 创建脚本文件
	filePath := path.Join(m.ScriptDir, id, "main")
	file, err := os.Create(filePath)
	if err != nil {
		return errors.Join(errors.New("create script file failed"), err)
	}
	defer file.Close()
	_, err = file.WriteString(script)
	if err != nil {
		return errors.Join(errors.New("write script file failed"), err)
	}
	err2 := m.createTool(name, typ, id)
	if err2 != nil {
		return errors.Join(errors.New("create tool failed"), err2)
	}
	return nil
}

func (m *ToolMgr) createTool(name string, typ ToolType, id string) error {
	// 注册
	tool, err := NewTool(ToolInit{
		ID:      id,
		storage: m.storage,
		initData: &ToolData{
			Name:      name,
			Typ:       typ,
			Created:   time.Now(),
			Updated:   time.Now(),
			githubUrl: url.URL{},
			Addr:      path.Join(m.ScriptDir, id, "main"),
		},
	})
	if err != nil {
		return errors.Join(errors.New("new tool failed"), err)
	}
	err = m.register(id, tool)
	if err != nil {
		return errors.Join(errors.New("register tool failed"), err)
	}
	err = tool.Save()
	if err != nil {
		return errors.Join(errors.New("save tool failed"), err)
	}
	return nil
}

func (m *ToolMgr) DeleteTool(id string) error {
	if !m.init.IsInitialized() {
		return misc.ErrNotInit
	}
	tool, err := m.GetTool(id)
	if err != nil {
		return errors.Join(errors.New("get tool failed"), err)
	}
	err = tool.OnDelete()
	if err != nil {
		return errors.Join(errors.New("delete tool failed"), err)
	}
	m.id2tool.Delete(id)
	m.ToolIDs.DeleteByValue(id, func(a, b string) bool { return a == b })
	err = m.SaveToolIDs()
	if err != nil {
		return errors.Join(errors.New("save toolIDs failed"), err)
	}
	return nil
}

func (m *ToolMgr) GetAllTool() map[string]ToolData {
	ret := make(map[string]ToolData)
	m.id2tool.Range(func(key string, value *Tool) bool {
		ret[key] = value.ToolData
		return true
	})
	return ret
}

func (m *ToolMgr) GetTool(id string) (*Tool, error) {
	tool, ok := m.id2tool.Load(id)
	if !ok {
		return nil, errors.New("invalid id")
	}
	return tool, nil
}

func (m *ToolMgr) register(id string, tool *Tool) error {
	// 写入内存
	m.id2tool.Store(id, tool)
	return nil
}
