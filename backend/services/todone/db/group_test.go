package db

import (
	"github.com/intmian/mian_go_lib/tool/misc"
	"gorm.io/gorm"
	"testing"
)

func debugGetConnect(t *testing.T, conType ConnectType) *gorm.DB {
	account := misc.InputWithFile("account")
	token := misc.InputWithFile("token")
	dbid := misc.InputWithFile("dbid")
	setting := Setting{
		AccountID: account,
		ApiToken:  token,
		DBID:      dbid,
	}
	mgr, err := NewMgr(setting)
	if err != nil {
		t.Fatal(err)
	}
	err = mgr.Connect(conType, &DirDB{})
	if err != nil {
		t.Fatal(err)
	}
	return mgr.GetConnect(conType)
}

func TestGroupDB(t *testing.T) {
	conn := debugGetConnect(t, ConnectTypeGroup)

	ID, err := CreateGroup(conn, "1", "debug", "title", 0)
	if err != nil {
		t.Fatal(err)
	}
	if ID == 0 {
		t.Fatal("ID should not be 0")
	}

	data, err := GetGroupsByUser(conn, "1")
	if err != nil {
		t.Fatal(err)
	}
	if data != nil {
		t.Fatal("data should be nil")
	}

}
