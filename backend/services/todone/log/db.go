package log

import "time"

type DbLog struct {
	Sql      string
	Rows     int64
	Duration time.Duration
	Err      error
}

type DbLogEntity struct {
	DbLog
}

func (d *DbLogEntity) TableName() string {
	return "todone_db_log"
}

func (d *DbLogEntity) GetWriteableData() *DbLog {
	return &d.DbLog
}
