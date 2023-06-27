package log_cache

import (
	"strings"
	"sync"
)

const CMaxRecordCount = 20

// TODO:之后可以新增一种节点只能显示20个日志，按键可以显示更多

type Mgr struct {
	logs   []string
	rwLock *sync.RWMutex
}

func (m *Mgr) Add(s string) bool {
	m.rwLock.Lock()
	defer m.rwLock.Unlock()
	if len(m.logs) >= CMaxRecordCount {
		m.logs = m.logs[1:]
	}
	m.logs = append(m.logs, s)
	return true
}

func (m *Mgr) Get() []string {
	m.rwLock.RLock()
	defer m.rwLock.RUnlock()
	return m.logs
}

func (m *Mgr) ToString() string {
	m.rwLock.RLock()
	defer m.rwLock.RUnlock()
	return strings.Join(m.logs, "")
}

func NewMgr() *Mgr {
	mgr := &Mgr{}
	mgr.logs = make([]string, 0)
	mgr.rwLock = &sync.RWMutex{}
	return mgr
}

var GLogCache = NewMgr()
