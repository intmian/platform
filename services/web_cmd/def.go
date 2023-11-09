// Package web_cmd 用于在web界面进行命令行程序调用
package web_cmd

// cmdParam 为命令行参数，用于启动程序
type cmdParam struct {
	name string
	help string
}

type cmdType int

const (
	eCmdTypeNull cmdType = iota
	eCmdTypePython
	eCmdType
)

// cmd 命令主体
type cmd struct {
	name    string
	cmdAddr string
}
