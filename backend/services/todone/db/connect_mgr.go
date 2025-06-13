package db

import (
	"errors"
	"fmt"
	"github.com/intmian/mian_go_lib/fork/d1_gorm_adapter/gormd1"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"log"
	"os"
	"sync"
	"time"
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
	wait := sync.WaitGroup{}
	wait.Add(5)
	var err1, err2, err3, err4, err5 error
	go func() {
		err1 = GTodoneDBMgr.Connect(ConnectTypeDir, &DirDB{})
		wait.Done()
	}()
	go func() {
		err2 = GTodoneDBMgr.Connect(ConnectTypeGroup, &GroupDB{})
		wait.Done()
	}()
	go func() {
		err3 = GTodoneDBMgr.Connect(ConnectTypeTask, &TaskDB{})
		wait.Done()
	}()
	go func() {
		err4 = GTodoneDBMgr.Connect(ConnectTypeTags, &TagsDB{})
		wait.Done()
	}()
	go func() {
		err5 = GTodoneDBMgr.Connect(ConnectTypeSubGroup, &SubGroupDB{})
		wait.Done()
	}()
	wait.Wait()
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil {
		return errors.Join(err1, err2, err3, err4, err5)
	}
	connectDir := GTodoneDBMgr.GetConnect(ConnectTypeDir)
	connectGroup := GTodoneDBMgr.GetConnect(ConnectTypeGroup)
	connectTask := GTodoneDBMgr.GetConnect(ConnectTypeTask)
	connectTags := GTodoneDBMgr.GetConnect(ConnectTypeTags)
	connectSubGroup := GTodoneDBMgr.GetConnect(ConnectTypeSubGroup)
	if connectDir == nil || connectGroup == nil || connectTask == nil || connectTags == nil || connectSubGroup == nil {
		return errors.New("connect is nil")
	}
	return nil
}

type Mgr struct {
	Setting      Setting
	type2connect map[ConnectType]*gorm.DB
	logger       logger.Interface
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

	// 打开 sql.log 文件（如果没有则创建）
	// 确保 dblog 目录存在
	if _, err := os.Stat("./dblog"); os.IsNotExist(err) {
		err = os.Mkdir("./dblog", 0755)
		if err != nil {
			panic("failed to create dblog directory")
		}
	}
	// 按日期和表名区分日志文件
	dateStr := time.Now().Format("2006-01-02")
	logPath := fmt.Sprintf("./dblog/%s.log", dateStr)
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0666)
	if err != nil {
		panic("failed to open log file")
	}
	//defer file.Close()

	// 创建一个自定义的 logger 输出到文件
	newLogger := logger.New(
		log.New(file, "SQL: ", log.LstdFlags), // 日志输出到 sql.log 文件
		logger.Config{
			LogLevel:                  logger.Info,     // 控制日志级别，Info 会输出 SQL 语句
			SlowThreshold:             5 * time.Second, // 慢查询日志阈值
			IgnoreRecordNotFoundError: true,            // 忽略 RecordNotFound 错误
			Colorful:                  false,           // 禁用颜色输出
		},
	)
	d.logger = newLogger

	return nil
}

func (d *Mgr) Connect(t ConnectType, orm interface{}) error {
	db, err := gorm.Open(gormd1.Open(d.Setting.ToStr()), &gorm.Config{
		Logger: d.logger,
	})
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
	ConnectTypeTags
	ConnectTypeSubGroup
)
