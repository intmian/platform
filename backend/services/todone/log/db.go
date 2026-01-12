package log

type DbLog struct {
	Sql      string
	Rows     int64
	Duration int64
	Err      string
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
