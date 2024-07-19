package toolmgr

import (
	"net/url"
	"time"
)

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

type Tool struct {
	name      string
	typ       ToolType
	created   time.Time
	updated   time.Time
	githubUrl url.URL
	ID        string
}
