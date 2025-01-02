package share

import (
	share2 "github.com/intmian/platform/backend/share"
)

const CmdRegister share2.Cmd = "register"

type RegisterReq struct {
	Account string
}

type RegisterRet struct {
	Suc bool
}

const CmdDeregister share2.Cmd = "deregister"

type DeregisterReq struct {
	Account string
}

type DeregisterRet struct {
	Suc bool
}

const CmdCheckToken share2.Cmd = "checkToken"

type CheckTokenReq struct {
	Account string
	Pwd     string
}

type CheckTokenRet struct {
	Pers []share2.Permission
}

const CmdDelToken share2.Cmd = "delToken"

type DelTokenReq struct {
	Account string
	TokenID int
}

type DelTokenRet struct {
	Suc bool
}

const CmdChangeToken share2.Cmd = "changeToken"

type ChangeTokenReq struct {
	Account string   `json:"account,omitempty"`
	TokenID string   `json:"tokenID,omitempty"`
	Pers    []string `json:"pers,omitempty"`
}

type ChangeTokenRet struct {
	Suc bool
}

const CmdCreateToken share2.Cmd = "createToken"

type CreateTokenReq struct {
	Account string
	Pwd     string
	Pers    []share2.Permission
}

type CreateTokenRet struct {
	TokenID int
	Suc     bool
}

const CmdGetAllAccount share2.Cmd = "getAllAccount"

type GetAllAccountReq struct{}

type GetAllAccountRet struct {
	// Account -> token -> Pers 这个token经过混淆，不是真实的token
	Accounts map[string]map[string][]share2.Permission
}
