package db

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/intmian/mian_go_lib/fork/d1_gorm_adapter/gormd1"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xbi"
	"github.com/intmian/mian_go_lib/xlog"
	log2 "github.com/intmian/platform/backend/services/todone/log"
	"github.com/intmian/platform/backend/share/utils"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Setting struct {
	AccountID string
	ApiToken  string
	DBID      string
	XBi       *xbi.XBi
	XLog      *xlog.XLog
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

	file := utils.GetSqlLog("todone")
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

	err := xbi.RegisterLogEntity(d.Setting.XBi, &log2.DbLogEntity{})
	if err != nil {
		return errors.Join(err, errors.New("register DbLogEntity failed"))
	}
	hookLogger := &misc.HookLogger{
		Interface: newLogger,
		Hook: func(
			ctx context.Context,
			sql string,
			rows int64,
			duration time.Duration,
			err error,
		) {
			dbLogEntity := &log2.DbLogEntity{}
			dbLogEntity.GetWriteableData().Sql = sql
			dbLogEntity.GetWriteableData().Rows = rows
			durationMillis := duration.Milliseconds()
			dbLogEntity.GetWriteableData().Duration = durationMillis
			if err != nil {
				dbLogEntity.GetWriteableData().Err = err.Error()
			}
			err = xbi.WriteLog[log2.DbLog](d.Setting.XBi, dbLogEntity)
			if err != nil {
				setting.XLog.ErrorErr("todone.log", errors.Join(err, errors.New("写入数据库日志失败")))
				return
			}
			
		},
	}

	d.logger = hookLogger

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
