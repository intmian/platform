package run

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/multi"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xstorage"
	"path"
	"strconv"
)

// runMgrData 用于在重启后恢复数据
type runMgrData struct {
	LastID uint32
	EnvIDs multi.SafeArr[uint32]
}

// RunMgrInit 外部依赖
type RunMgrInit struct {
	Storage  *xstorage.XStorage
	BaseAddr string
	Log      *xlog.XLog
}

// RunMgr 运行环境管理器
type RunMgr struct {
	RunMgrInit
	data runMgrData

	runDir *misc.FileNode
	init   misc.InitTag

	envId2Env multi.SafeMap[uint32, *Env]
}

func (m *RunMgr) Init(init RunMgrInit) error {
	if m.init.IsInitialized() {
		return errors.New("already initialized")
	}
	m.RunMgrInit = init
	fileNode, err := misc.GetFileTree(init.BaseAddr)
	if err != nil {
		return errors.Join(errors.New("get file tree failed"), err)
	}
	m.runDir = &fileNode

	// 从持久化数据中复原
	err = m.Load()
	if err != nil {
		return errors.Join(errors.New("load runmgr data failed"), err)
	}
	// 初始化后调用各个env的初始化
	var errR error
	m.data.EnvIDs.Range(func(i int, envID uint32) bool {
		env, err := NewEnv(EnvInit{
			storage: m.Storage,
			log:     m.Log,
			addr:    xstorage.Join(m.BaseAddr, strconv.Itoa(int(envID))),
			id:      envID,
		})
		if err != nil {
			errR = errors.Join(errors.New("init env failed"), err)
			return false
		}
		m.envId2Env.Store(envID, env)
		return true
	})
	if errR != nil {
		return errR
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

func (m *RunMgr) Load() error {
	err := m.Storage.GetFromJson(xstorage.Join("cmd", "runmgr", "data", "lastID"), &m.data.LastID)
	if err != nil && !errors.Is(err, xstorage.ErrNoData) {
		return errors.Join(errors.New("get lastID failed"), err)
	}
	var data []uint32
	err = m.Storage.GetFromJson(xstorage.Join("cmd", "runmgr", "data", "envIDs"), &data)
	if err != nil && !errors.Is(err, xstorage.ErrNoData) {
		return errors.Join(errors.New("get envIDs failed"), err)
	}

	return nil
}

func (m *RunMgr) SaveEnvIDs() error {
	return m.Storage.SetToJson(xstorage.Join("cmd", "runmgr", "data", "envIDs"), m.data.EnvIDs.Copy())
}

func (m *RunMgr) SaveLastID() error {
	return m.Storage.SetToJson(xstorage.Join("cmd", "runmgr", "data", "lastID"), m.data.LastID)
}

func (m *RunMgr) GetNewEnvID() uint32 {
	m.data.LastID++
	_ = m.SaveLastID()
	return m.data.LastID
}

func (m *RunMgr) CreateEnv() *Env {
	id := m.GetNewEnvID()
	env, err := NewEnv(EnvInit{
		storage:  m.Storage,
		log:      m.Log,
		addr:     path.Join(m.BaseAddr, strconv.Itoa(int(id))),
		id:       id,
		initData: &EnvData{},
	})
	if err != nil {
		m.Log.WarningErr("RUNMGR", errors.Join(errors.New("create env failed"), err))
		return nil
	}
	m.envId2Env.Store(id, env)
	m.data.EnvIDs.Append(id)
	err = m.SaveEnvIDs()
	if err != nil {
		m.Log.WarningErr("RUNMGR", errors.Join(errors.New("save envIDs failed"), err))
	}
	m.Log.Info("RUNMGR", "create env %d", id)
	return env
}

func (m *RunMgr) GetEnv(id uint32) *Env {
	env, _ := m.envId2Env.Load(id)
	return env
}

func (m *RunMgr) DeleteEnv(id uint32) {
	m.envId2Env.Delete(id)
	i := 0
	m.data.EnvIDs.Range(func(index int, envID uint32) bool {
		if envID == id {
			m.data.EnvIDs.Delete(index)
			return false
		}
		i++
		return true
	})
}

func (m *RunMgr) GetEnvIDs() []uint32 {
	ids := make([]uint32, 0)
	m.envId2Env.Range(func(key uint32, value *Env) bool {
		ids = append(ids, key)
		return true
	})
	return ids
}
