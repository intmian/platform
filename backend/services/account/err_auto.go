package account

type ErrStr string

const (
	ErrNil                           = ErrStr("nil")
	ErrAccDbInitErr                  = ErrStr("accDb Init err")                     // auto generated from .\accountMgr.go
	ErrAccountMgrNotInit             = ErrStr("accountMgr not init")                // auto generated from .\accountMgr.go
	ErrPasswordFormatError           = ErrStr("password format error")              // auto generated from .\accountMgr.go
	ErrAccDbSetErr                   = ErrStr("accDb Set err")                      // auto generated from .\accountMgr.go
	ErrAccDbGetErr                   = ErrStr("accDb Get err")                      // auto generated from .\accountMgr.go
	ErrAccDbDeleteErr                = ErrStr("accDb OnDelete err")                 // auto generated from .\accountMgr.go
	ErrAccInitErr                    = ErrStr("acc Init err")                       // auto generated from .\services.go
	ErrJsonMarshalErr                = ErrStr("json marshal err")                   // auto generated from .\accountMgr.go
	ErrAccountNotExist               = ErrStr("account not exist")                  // auto generated from .\accountMgr.go
	ErrJsonUnmarshalFailed           = ErrStr("json.Unmarshal failed")              // auto generated from .\accountMgr.go
	ErrTokenNotExist                 = ErrStr("token not exist")                    // auto generated from .\accountMgr.go
	ErrSssssaSSSd                    = ErrStr("sssssaSSSd")                         // auto generated from .\services.go
	ErrNothing                       = ErrStr("nothing")                            // auto generated from .\services.go
	ErrCanNotDeleteTheLastPermission = ErrStr("can not delete the last permission") // auto generated from .\accountMgr.go
	ErrUnknownCmd                    = ErrStr("unknown cmd")                        // auto generated from .\services.go
	ErrGetAllAccountFailed           = ErrStr("get all account failed")             // auto generated from .\accountMgr.go
	ErrTokenAlreadyExist             = ErrStr("token already exist")                // auto generated from .\accountMgr.go
	ErrRegisterFailed                = ErrStr("register failed")                    // auto generated from .\services.go
)

func (e ErrStr) Error() string { return string(e) }
