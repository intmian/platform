package setting

import "github.com/intmian/mian_go_lib/xstorage"

// 微服务话后，被迁移到传入的storage
//
//	type Mgr struct {
//		j      *misc.TJsonTool
//		data   map[string]interface{} // 为了方便通用的存储机制暂时将
//		rwLock *sync.RWMutex
//	}
//
//	func (m *Mgr) Data() map[string]interface{} {
//		return m.data
//	}
//
//	func NewMgr() *Mgr {
//		m := &Mgr{
//			j:      nil,
//			data:   make(map[string]interface{}),
//			rwLock: new(sync.RWMutex),
//		}
//		m.j = misc.NewTJsonTool("setting.json", &m.data)
//		return m
//	}
//
//	func (m *Mgr) Load() {
//		m.rwLock.Lock()
//		m.j.Load("setting.json")
//		m.rwLock.Unlock()
//	}
//
//	func (m *Mgr) Get(key string) interface{} {
//		m.rwLock.RLock()
//		defer m.rwLock.RUnlock()
//		if v, ok := m.data[key]; ok {
//			return v
//		} else {
//			return nil
//		}
//	}
//
//	func (m *Mgr) Exist(key string) bool {
//		m.rwLock.RLock()
//		defer m.rwLock.RUnlock()
//		if _, ok := m.data[key]; ok {
//			return true
//		} else {
//			return false
//		}
//	}
//
//	func (m *Mgr) Set(key string, value interface{}) {
//		m.rwLock.Lock()
//		m.data[key] = value
//		m.rwLock.Unlock()
//	}
//
//	func (m *Mgr) Save() {
//		m.rwLock.RLock()
//		m.j.Save()
//		m.rwLock.RUnlock()
//	}
var GSetting *xstorage.XStorage
