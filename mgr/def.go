package mgr

import "github.com/intmian/platform/services/share"

type SvrName string

const (
	AUTO SvrName = "auto"
	NOTE SvrName = "note"
)

type SvrFlag int

const (
	FLAG_NONE SvrFlag = iota
	FLAG_AUTO
	FLAG_NOTE
)

type Service struct {
	name SvrName
	svr  share.Service
}
