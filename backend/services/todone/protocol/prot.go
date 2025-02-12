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
