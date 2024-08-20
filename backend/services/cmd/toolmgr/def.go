package toolmgr

type ToolType int

const (
	ToolTypeNull   ToolType = 0
	ToolTypePython ToolType = 1

	ToolTypeFileBegin ToolType = 100
	ToolTypeFileExec  ToolType = 101
)

func IsToolTypeFile(t ToolType) bool {
	return t >= ToolTypeFileBegin
}

func IsToolTypeScript(t ToolType) bool {
	return t > ToolTypeNull && t < ToolTypeFileBegin
}
