package db

type ErrStr string

const(
    ErrNil = ErrStr("nil")
    ErrConnectDbFailed = ErrStr("connect db failed")  // auto generated from .\connectMgr.go
    ErrAutoMigrateFailed = ErrStr("auto migrate failed")  // auto generated from .\connectMgr.go
)

func (e ErrStr) Error() string { return string(e) }
