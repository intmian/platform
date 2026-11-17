package todone

import (
	"github.com/intmian/platform/backend/services/todone/protocol"
	"github.com/intmian/platform/backend/share"
)

const (
	CmdGetOverview      share.Cmd = "getOverview"
	CmdSetGroupFavorite share.Cmd = "setGroupFavorite"
	CmdSetTaskDone      share.Cmd = "setTaskDone"
)

type GetOverviewReq struct {
	UserID string
}

type OverviewGroup struct {
	DirID    uint32
	GroupID  uint32
	Type     int
	Title    string
	Path     []string
}

// OverviewFavorite 收藏项，按收藏先后排列。SubGroupID 为 0 表示整个分组。
type OverviewFavorite struct {
	GroupID    uint32
	SubGroupID uint32
}

type OverviewSubGroup struct {
	ID      uint32
	GroupID uint32
	Title   string
	Index   float32
}

type OverviewTask struct {
	GroupID     uint32
	SubGroupID  uint32
	ParentTitle string
	Task        protocol.PTask // 不含 Note
}

type OverviewRoutineNode struct {
	GroupID uint32
	Node    protocol.PRoutineNode
}

// GetOverviewRet 总视图需要的全部数据，一次返回：
//   - 分组、子分组全部返回（收藏入口要列出来）；任务只返回收藏范围内的未完成任务。
//   - 例行清单被收藏到（整张或其中一栏）就返回整张的任务和节点状态（“是否到期”由前端按规则算）。
//   - 娱乐库不参与。
type GetOverviewRet struct {
	Groups       []OverviewGroup
	SubGroups    []OverviewSubGroup
	Tasks        []OverviewTask
	RoutineNodes []OverviewRoutineNode
	Favorites    []OverviewFavorite
}

type SetGroupFavoriteReq struct {
	UserID      string
	ParentDirID uint32
	GroupID     uint32
	SubGroupID  uint32 // 0 表示整个分组
	Favorite    bool
}

type SetGroupFavoriteRet struct{}

// SetTaskDoneReq 只改完成状态。总视图拿到的任务不含 Note，不能走 changeTask 整体覆盖。
type SetTaskDoneReq struct {
	UserID     string
	DirID      uint32
	GroupID    uint32
	SubGroupID uint32
	TaskID     uint32
	Done       bool
}

type SetTaskDoneRet struct{}
