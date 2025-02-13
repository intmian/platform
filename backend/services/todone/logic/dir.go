package logic

import (
	"errors"
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

func (d *DirLogic) ChangeData(title, note string, index float32) error {
	if title != "" {
		d.dbData.Title = title
	}
	if note != "" {
		d.dbData.Note = note
	}
	if index != 0 {
		d.dbData.Index = index
	}
	err := d.Save()
	if err != nil {
		return errors.Join(err, errors.New("save dir failed"))
	}
	return nil
}

func (d *DirLogic) Delete() error {
	conn := db.GTodoneDBMgr.GetConnect(db.ConnectTypeDir)
	return db.DeleteDir(conn, d.dbData.ID)
}
