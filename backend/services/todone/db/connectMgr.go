package db

import (
	"fmt"
	"github.com/pkg/errors"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type DBSetting struct {
	User   string
	Passwd string
	Host   string
	Port   string
	DbName string
}

func (s *DBSetting) ToStr() string {
	str := "%s:%s@tcp(%s:%s)/%s?charset=utf8&parseTime=True&loc=Local"
	return fmt.Sprintf(str, s.User, s.Passwd, s.Host, s.Port, s.DbName)
}

type Mgr struct {
	Setting      DBSetting
	type2connect map[ConnectType]*gorm.DB
}

func NewMgr(setting DBSetting) (*Mgr, error) {
	var mgr Mgr
	err := mgr.Init(setting)
	if err != nil {
		return nil, err
	}
	return &mgr, nil
}

func (d *Mgr) Init(setting DBSetting) error {
	d.Setting = setting
	d.type2connect = make(map[ConnectType]*gorm.DB)
	return nil
}

func (d *Mgr) Connect(t ConnectType, orm interface{}) error {
	db, err := gorm.Open(mysql.Open(d.Setting.ToStr()))
	if err != nil {
		return errors.Wrap(err, "connect db failed")
	}
	d.type2connect[t] = db
	// 自动创建表
	err = db.AutoMigrate(orm)
	if err != nil {
		return errors.Wrap(err, "auto migrate failed")
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
)
