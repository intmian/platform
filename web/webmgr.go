package web

import "github.com/intmian/mian_go_lib/xstorage"

var GWebMgr Mgr

type Mgr struct {
	p xstorage.WebPack
}

func (m *Mgr) Init(
