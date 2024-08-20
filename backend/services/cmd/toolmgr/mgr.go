package toolmgr

import (
	"errors"
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
	LastID  uint32
	ToolIDs multi.SafeArr[string]
}

// ToolMgrInit 外部依赖
type ToolMgrInit struct {
	storage       *xstorage.XStorage
	scriptDirNode misc.FileNode // 脚本的实际存储地址
	log           *xlog.XLog
}

type ToolMgr struct {
	ToolMgrInit
	toolMgrData
	storage *xstorage.XStorage
	id2tool multi.SafeMap[string, *Tool]
	init    misc.InitTag
	node    *snowflake.Node
}

func (m *ToolMgr) Init(init ToolMgrInit) error {
	if m.init.IsInitialized() {
		return errors.New("already initialized")
	}
	m.ToolMgrInit = init
	m.storage = init.storage
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
				ID: id,
			})
			if err != nil {
				m.log.WarningErr("ToolMgr", errors.Join(errors.New("init tool failed"), err))
				continue
			}
			err = m.register(id, tool)
			if err != nil {
				m.log.WarningErr("ToolMgr", errors.Join(errors.New("register tool failed"), err))
				continue
			}
		}
	})

	m.init.SetInitialized()
	return nil
}

func (m *ToolMgr) Save() error {
	err := m.storage.SetToJson(xstorage.Join("CMD", "toolMgr"), m.toolMgrData)
	if err != nil {
		return errors.Join(errors.New("set toolMgr data failed"), err)
	}
	return nil
}

func (m *ToolMgr) Load() error {
	err := m.storage.GetFromJson(xstorage.Join("CMD", "toolMgr"), &m.toolMgrData)
	if err != nil {
		return errors.Join(errors.New("get toolMgr data failed"), err)
	}
	return nil
}

func (m *ToolMgr) UploadText(text string, name string, typ ToolType) error {
	if !m.init.IsInitialized() {
		return misc.ErrNotInit
	}
	if !IsToolTypeScript(typ) {
		return errors.New("invalid tool type")
	}
	if text == "" || name == "" {
		return errors.New("invalid text or Name")
	}

	id := m.node.Generate().String()
	// 创建ID对应的文件夹
	err := m.scriptDirNode.File.MakeChildEmptyFile(id, true)
	if err != nil {
		return errors.Join(errors.New("create script dir failed"), err)
	}
	// 创建脚本文件
	filePath := path.Join(m.scriptDirNode.File.Addr, id, "main")
	file, err := os.Create(filePath)
	if err != nil {
		return errors.Join(errors.New("create script file failed"), err)
	}
	defer file.Close()
	_, err = file.WriteString(text)
	if err != nil {
		return errors.Join(errors.New("write script file failed"), err)
	}
	err2 := m.CreateTool(name, typ, id)
	if err2 != nil {
		return errors.Join(errors.New("create tool failed"), err2)
	}
	return nil
}

func (m *ToolMgr) CreateTool(name string, typ ToolType, id string) error {
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
			Addr:      path.Join(m.scriptDirNode.File.Addr, id, "main"),
		},
	})
	if err != nil {
		return errors.Join(errors.New("new tool failed"), err)
	}
	err = m.register(id, tool)
	if err != nil {
		return errors.Join(errors.New("register tool failed"), err)
	}
	return nil
}

func (m *ToolMgr) GetAllToolID() []string {
	var ids []string
	m.id2tool.Range(func(key string, value *Tool) bool {
		ids = append(ids, key)
		return true
	})
	return ids
}

func (m *ToolMgr) GetTool(id string) (*Tool, error) {
	tool, ok := m.id2tool.Load(id)
	if !ok {
		return nil, errors.New("invalid id")
	}
	return tool, nil
}

func (m *ToolMgr) register(id string, tool *Tool) error {
	// 写入内存并存入硬盘
	m.id2tool.Store(id, tool)
	err := m.storage.SetToJson(xstorage.Join("CMD", "toolMgr", id), tool)
	if err != nil {
		return errors.Join(errors.New("set tool failed"), err)
	}
	return nil
}
