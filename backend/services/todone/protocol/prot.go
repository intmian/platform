package protocol

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
	Tasks []PTaskMini
}

type PTaskMini struct {
	ID    uint32
	Title string
	Done  bool
}

type PTask struct {
	ID       uint32
	Title    string
	Note     string
	Index    float32
	Tags     []string
	SubTasks []PTaskMini
}
