package db

import (
	"errors"
	"fmt"
	"github.com/intmian/gorm-driver-d1/gormd1"
	"gorm.io/gorm"
)

type Setting struct {
	AccountID string
	ApiToken  string
	DBID      string
}

func (s *Setting) ToStr() string {
	str := "d1://%s:%s@%s"
	return fmt.Sprintf(str, s.AccountID, s.ApiToken, s.DBID)
}

// GTodoneDBMgr 全应用全局数据库管理器
var GTodoneDBMgr Mgr

func InitGMgr(setting Setting) error {
	err := GTodoneDBMgr.Init(setting)
	if err != nil {
		return err
	}
	err1 := GTodoneDBMgr.Connect(ConnectTypeDir, &DirDB{})
	err2 := GTodoneDBMgr.Connect(ConnectTypeGroup, &GroupDB{})
	err3 := GTodoneDBMgr.Connect(ConnectTypeTask, &TaskDB{})
	err4 := GTodoneDBMgr.Connect(ConnectionTypeTags, &TagsDB{})
	err5 := GTodoneDBMgr.Connect(ConnectionTypeSubGroup, &SubGroupDB{})
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil {
		return errors.Join(err1, err2, err3, err4, err5)
	}
	return nil
}

type Mgr struct {
	Setting      Setting
	type2connect map[ConnectType]*gorm.DB
}

func NewMgr(setting Setting) (*Mgr, error) {
	var mgr Mgr
	err := mgr.Init(setting)
	if err != nil {
		return nil, err
	}
	return &mgr, nil
}

func (d *Mgr) Init(setting Setting) error {
	d.Setting = setting
	d.type2connect = make(map[ConnectType]*gorm.DB)
	return nil
}

func (d *Mgr) Connect(t ConnectType, orm interface{}) error {
	db, err := gorm.Open(gormd1.Open(d.Setting.ToStr()))
	if err != nil {
		return errors.Join(err, ErrConnectDbFailed)
	}
	d.type2connect[t] = db
	// 自动创建表
	err = db.AutoMigrate(orm)
	if err != nil {
		return errors.Join(err, ErrAutoMigrateFailed)
	}
	return nil
}

func (d *Mgr) GetConnect(t ConnectType) *gorm.DB {
	return d.type2connect[t]
}

type ConnectType int

const (
	ConnectTypeNull ConnectType = iota
	ConnectTypeDir
	ConnectTypeGroup
	ConnectTypeTask
	ConnectionTypeTags
	ConnectionTypeSubGroup
)
