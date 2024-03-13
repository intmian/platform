package share

import "github.com/intmian/platform/services/share"

const CmdRegister share.Cmd = "register"

type RegisterReq struct {
	Account         string
	Pwd2permissions map[string][]Permission
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
	Token   string
}

type Permission string

const (
	PermissionAdmin string = "admin"
)
