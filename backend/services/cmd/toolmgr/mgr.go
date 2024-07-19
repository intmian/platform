package toolmgr

import (
	"encoding/json"
	"errors"
	"github.com/bwmarrin/snowflake"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"io"
	"net/url"
	"os"
	"path"
	"time"
)

type ToolMgr struct {
	scriptDirNode misc.FileNode // 脚本的实际存储地址
	storage       *xstorage.XStorage
	id2tool       map[string]*Tool
	init          misc.InitTag
	node          *snowflake.Node
}

func (m *ToolMgr) UploadText(text string, name string, typ ToolType) error {
	if !m.init.IsInitialized() {
		return misc.ErrNotInit
	}
	if !IsToolTypeScript(typ) {
		return errors.New("invalid tool type")
	}
	if text == "" || name == "" {
		return errors.New("invalid text or name")
	}

	id := m.node.Generate().String()
	tool := &Tool{
		name:      name,
		typ:       typ,
		created:   time.Now(),
		updated:   time.Now(),
		githubUrl: url.URL{},
		ID:        id,
	}
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
	// 注册
	err = m.register(id, tool)
	if err != nil {
		return errors.Join(errors.New("register tool failed"), err)
	}
	return nil
}

// TODO: 实现外部传入的文件与github相关的处理

func (m *ToolMgr) getFileAddr(id string) string {
	// 判断有无ID
	if _, ok := m.id2tool[id]; !ok {
		return ""
	}
	return path.Join(m.scriptDirNode.File.Addr, id, "main")
}

func (m *ToolMgr) GetAllToolID() []string {
	ids := []string{}
	for id := range m.id2tool {
		ids = append(ids, id)
	}
	return ids
}

func (m *ToolMgr) GetTool(id string) (*Tool, error) {
	tool, ok := m.id2tool[id]
	if !ok {
		return nil, errors.New("invalid id")
	}
	return tool, nil
}

func (m *ToolMgr) GetScriptContent(id string) (string, error) {
	fileAddr := m.getFileAddr(id)
	if fileAddr == "" {
		return "", errors.New("invalid id")
	}
	if !IsToolTypeScript(m.id2tool[id].typ) {
		return "", errors.New("invalid tool type")
	}
	file, err := os.Open(fileAddr)
	if err != nil {
		return "", errors.Join(errors.New("open script file failed"), err)
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		return "", errors.Join(errors.New("read script file failed"), err)
	}
	return string(content), nil
}

func (m *ToolMgr) register(id string, tool *Tool) error {
	// 写入内存并存入硬盘
	m.id2tool[id] = tool
	jsonStr, err := json.Marshal(tool)
	err = m.storage.Set(id, xstorage.ToUnit(string(jsonStr), xstorage.ValueTypeString))
	if err != nil {
		return errors.Join(errors.New("set tool failed"), err)
	}
	return nil
}
