package share

type Cmd string

const (
	CmdRegister   string = "register"
	CmdDeregister string = "deregister"
)

type Permission string

const (
	PermissionAdmin string = "admin"
	PermissionAuto  string = "auto"
)
