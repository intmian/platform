package account

type ErrStr string

const(
    ErrNil = ErrStr("nil")
    ErrAccDbInitErr = ErrStr("accDb Init err")  // auto generated from .\accountMgr.go
    ErrAccountMgrNotInit = ErrStr("accountMgr not init")  // auto generated from .\accountMgr.go
    ErrPasswordFormatError = ErrStr("password format error")  // auto generated from .\accountMgr.go
    ErrAccDbSetErr = ErrStr("accDb Set err")  // auto generated from .\accountMgr.go
    ErrAccDbGetErr = ErrStr("accDb Get err")  // auto generated from .\accountMgr.go
    ErrAccDbDeleteErr = ErrStr("accDb Delete err")  // auto generated from .\accountMgr.go
    ErrAccInitErr = ErrStr("acc Init err")  // auto generated from .\services.go
)

func (e ErrStr) Error() string { return string(e) }
