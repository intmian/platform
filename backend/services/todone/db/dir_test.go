package db

import (
	"github.com/intmian/mian_go_lib/tool/misc"
	"testing"
)

func TestCreateDir(t *testing.T) {
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
	err = mgr.Connect(ConnectTypeDir, &DirDB{})
	if err != nil {
		t.Fatal(err)
	}
	dirDB := mgr.GetConnect(ConnectTypeDir)
	CreateDir(dirDB, "1", 2, "title", "content")
}
