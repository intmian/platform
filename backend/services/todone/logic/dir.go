package logic

import (
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
)

type DirLogic struct {
	dbData *db.DirDB
}

func NewDirLogic(ID uint32) *DirLogic {
	return &DirLogic{
		dbData: &db.DirDB{
			ID: ID,
		},
	}
}

func (d *DirLogic) OnBindOutData(dbData *db.DirDB) {
	d.dbData = dbData
}

func (d *DirLogic) ToProtocol() protocol.PDir {
	return protocol.PDir{
		ID:    d.dbData.ID,
		Title: d.dbData.Title,
		Note:  d.dbData.Note,
		Index: d.dbData.Index,
	}
}

func (d *DirLogic) Save() error {
	conn := db.GTodoneDBMgr.GetConnect(db.ConnectTypeDir)
	return db.ChangeDir(conn, d.dbData)
}
