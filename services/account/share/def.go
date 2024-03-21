package share

import (
	share2 "github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/services/share"
)

const CmdRegister share.Cmd = "register"

type RegisterReq struct {
	Account         string
	Pwd2permissions map[string][]share2.Permission
}

type RegisterRet struct {
	Suc map[string][]share2.Permission
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
	Token   string
}

type CheckTokenRet struct {
	Pers []share2.Permission
}
