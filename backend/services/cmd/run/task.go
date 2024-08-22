package run

import "github.com/intmian/platform/backend/services/cmd/tool"

type TaskInit struct {
	tool  *tool.Tool
	param []string
	env   *Env
}

type Task struct {
}
