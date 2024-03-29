package share

import (
	share2 "github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/services/share"
)

const CmdRegister share.Cmd = "register"

type RegisterReq struct {
	Account string
}

type RegisterRet struct {
	Suc bool
}

const CmdDeregister share.Cmd = "deregister"

type DeregisterReq struct {
	Account string
}

type DeregisterRet struct {
	Suc bool
}

const CmdCheckToken share.Cmd = "checkToken"

type CheckTokenReq struct {
	Account string
	Pwd     string
}

type CheckTokenRet struct {
	Pers []share2.Permission
}

const CmdDelToken share.Cmd = "delToken"

type DelTokenReq struct {
	Account string
	TokenID int
}

type DelTokenRet struct {
	Suc bool
}

const CmdChangeToken share.Cmd = "changeToken"

type ChangeTokenReq struct {
	Account string
	TokenID int
	Pers    []share2.Permission
}

type ChangeTokenRet struct {
	Suc bool
}

const CmdGetAllAccount share.Cmd = "getAllAccount"

type GetAllAccountReq struct{}

type GetAllAccountRet struct {
	// Account -> token -> Pers 这个token经过混淆，不是真实的token
	Accounts map[string]map[string][]share2.Permission
}
