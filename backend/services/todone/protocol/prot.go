package protocol

import "time"

type PDir struct {
	ID    uint32
	Title string
	Note  string
	Index float32
}

type PGroup struct {
	ID    uint32
	Title string
	Note  string
	Index float32
	Type  int
}

type PDirTree struct {
	RootDir     PDir
	ChildrenDir []PDirTree
	ChildrenGrp []PGroup
}

type PSubGroup struct {
	ID    uint32
	Title string
	Note  string
	Index float32
}

type PTask struct {
	ID       uint32
	Title    string
	Note     string
	Index    float32
	Tags     []string
	Done     bool
	ParentID uint32

	// 额外信息
	TaskType int
	Started  bool // 是否开始
	// 开始时间
	BeginTime time.Time
	// 结束时间或者截止时间
	EndTime time.Time
	Wait4   string
}
