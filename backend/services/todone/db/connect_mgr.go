package db

import (
	"context"
	"errors"
	"log"
	"time"

	d1 "github.com/intmian/gorm-d1-adapter"
	"github.com/intmian/gorm-d1-adapter/gormd1"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xbi"
	"github.com/intmian/mian_go_lib/xlog"
	log2 "github.com/intmian/platform/backend/services/todone/log"
	"github.com/intmian/platform/backend/share/utils"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Setting struct {
	WorkerEndpoint string
	WorkerToken    string
	Ctx            context.Context
	XBi            *xbi.XBi
	XLog           *xlog.XLog
}

// GTodoneDBMgr 全应用全局数据库管理器
var GTodoneDBMgr Mgr

func InitGMgr(setting Setting) error {
	err := GTodoneDBMgr.Init(setting)
	if err != nil {
		return err
	}
	connections := []struct {
		connectType ConnectType
		model       any
	}{
		{ConnectTypeDir, &DirDB{}},
		{ConnectTypeGroup, &GroupDB{}},
		{ConnectTypeTask, &TaskDB{}},
		{ConnectTypeTags, &TagsDB{}},
		{ConnectTypeSubGroup, &SubGroupDB{}},
		{ConnectTypeLibraryNote, &LibraryNoteDB{}},
	}
	for _, connection := range connections {
		if err = GTodoneDBMgr.Connect(connection.connectType, connection.model); err != nil {
			return err
		}
	}
	connectDir := GTodoneDBMgr.GetConnect(ConnectTypeDir)
	connectGroup := GTodoneDBMgr.GetConnect(ConnectTypeGroup)
	connectTask := GTodoneDBMgr.GetConnect(ConnectTypeTask)
	connectTags := GTodoneDBMgr.GetConnect(ConnectTypeTags)
	connectSubGroup := GTodoneDBMgr.GetConnect(ConnectTypeSubGroup)
	connectLibraryNote := GTodoneDBMgr.GetConnect(ConnectTypeLibraryNote)
	if connectDir == nil || connectGroup == nil || connectTask == nil || connectTags == nil || connectSubGroup == nil || connectLibraryNote == nil {
		return errors.New("connect is nil")
	}
	return nil
}

type Mgr struct {
	Setting      Setting
	type2connect map[ConnectType]*gorm.DB
	db           *gorm.DB
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
	if d.db != nil {
		sqlDB, err := d.db.DB()
		if err != nil {
			return errors.Join(err, ErrConnectDbFailed)
		}
		if err = sqlDB.Close(); err != nil {
			return errors.Join(err, ErrConnectDbFailed)
		}
		d.db = nil
	}
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
			ParameterizedQueries:      true,            // 私有正文等参数不能进入 SQL/BI 日志
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
	if d.db == nil {
		db, err := gorm.Open(gormd1.OpenConfig(d1.Config{
			Mode:           d1.ExecutorModeWorker,
			WorkerEndpoint: d.Setting.WorkerEndpoint,
			WorkerToken:    d.Setting.WorkerToken,
		}), &gorm.Config{
			Logger: d.logger,
		})
		if err != nil {
			return errors.Join(err, ErrConnectDbFailed)
		}
		ctx := d.Setting.Ctx
		if ctx == nil {
			ctx = context.Background()
		}
		sqlDB, err := db.DB()
		if err != nil {
			return errors.Join(err, ErrConnectDbFailed)
		}
		if err = sqlDB.PingContext(ctx); err != nil {
			return errors.Join(err, ErrConnectDbFailed)
		}
		d.db = db
	}
	// 同一个D1只使用一个GORM根连接，所有表按顺序迁移。
	err := d.db.AutoMigrate(orm)
	if err != nil {
		return errors.Join(err, ErrAutoMigrateFailed)
	}
	d.type2connect[t] = d.db
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
	ConnectTypeLibraryNote
)
