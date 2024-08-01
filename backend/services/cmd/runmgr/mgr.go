package runmgr

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xstorage"
)

// runMgrData 用于在重启后恢复数据
type runMgrData struct {
	LastID uint32
	EnvIDs []uint32
}

type RunMgr struct {
	RunMgrInit
	data runMgrData

	runDir *misc.FileNode
	init   misc.InitTag

	envId2Env map[uint32]*Env
}

type RunMgrInit struct {
	storage  *xstorage.XStorage
	baseAddr string
	log      *xlog.XLog
}

func (m *RunMgr) Init(init RunMgrInit) error {
	if m.init.IsInitialized() {
		return errors.New("already initialized")
	}
	m.RunMgrInit = init
	fileNode, err := misc.GetFileTree(init.baseAddr)
	if err != nil {
		return errors.Join(errors.New("get file tree failed"), err)
	}
	m.runDir = &fileNode

	// 从持久化数据中复原
	err = m.Load()
	if err != nil {
		return errors.Join(errors.New("load runmgr data failed"), err)
	}

	m.init.SetInitialized()
	return nil
}

func NewRunMgr(init RunMgrInit) *RunMgr {
	mgr := &RunMgr{}
	err := mgr.Init(init)
	if err != nil {
		panic(err)
	}
	return mgr
}

func (m *RunMgr) Save() error {
	return m.storage.SetToJson(xstorage.Join("cmd", "runmgr", "data"), m.data)
}

func (m *RunMgr) Load() error {
	return m.storage.GetFromJson(xstorage.Join("cmd", "runmgr", "data"), &m.data)
}

func (m *RunMgr) GetNewEnvID() uint32 {
	m.data.LastID++
	_ = m.Save()
	return m.data.LastID
}

func (m *RunMgr) CreateEnv() *Env {
	id := m.GetNewEnvID()
	env := &Env{}
	env.ID = id
	m.envId2Env[id] = env
	go func() {
		err := env.Save()
		if err != nil {
			m.log.Error("RUNMGR", "save env failed %v", err)
		}
	}()
	m.log.Info("RUNMGR", "create env %d", id)
	return env
}

func (m *RunMgr) GetEnv(id uint32) *Env {
	return m.envId2Env[id]
}

func (m *RunMgr) DeleteEnv(id uint32) {
	delete(m.envId2Env, id)
}

func (m *RunMgr) GetEnvIDs() []uint32 {
	ids := make([]uint32, 0, len(m.envId2Env))
	for id := range m.envId2Env {
		ids = append(ids, id)
	}
	return ids
}
