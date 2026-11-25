package todone

import (
	"errors"
	"sort"
	"sync"

	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/logic"
	"github.com/intmian/platform/backend/services/todone/protocol"
	backendshare "github.com/intmian/platform/backend/share"
)

const flagTag = "[system]flag"

func (s *Service) OnSetGroupFavorite(_ backendshare.Valid, req SetGroupFavoriteReq) (ret SetGroupFavoriteRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		group := user.GetGroupLogic(req.ParentDirID, req.GroupID)
		if group == nil {
			err = errors.New("group not exist")
			return
		}
		if req.SubGroupID != 0 && user.GetSubGroupLogic(req.ParentDirID, req.GroupID, req.SubGroupID) == nil {
			err = errors.New("sub group not exist")
			return
		}
		err = db.SetGroupFavorite(db.GTodoneDBMgr.GetConnect(db.ConnectTypeFavorite), req.UserID, req.GroupID, req.SubGroupID, req.Favorite)
	}, func() { err = errors.New("user not exist") })
	return
}

func (s *Service) OnSetTaskDone(_ backendshare.Valid, req SetTaskDoneReq) (ret SetTaskDoneRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		subGroup := user.GetSubGroupLogic(req.DirID, req.GroupID, req.SubGroupID)
		if subGroup == nil {
			err = errors.New("sub group not exist")
			return
		}
		// 先只读校验归属，再取 TaskLogic：GetTaskLogic 会把未缓存的任务追加进这个子分组的顺序。
		taskDB, getErr := db.GetTaskByID(db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask), req.TaskID)
		if getErr != nil || taskDB == nil || taskDB.UserID != req.UserID || taskDB.Deleted || taskDB.ParentSubGroupID != req.SubGroupID {
			err = errors.New("task not exist")
			return
		}
		task := subGroup.GetTaskLogic(req.TaskID)
		if task == nil {
			err = errors.New("task not exist")
			return
		}
		data, dataErr := task.GetTaskData()
		if dataErr != nil || data == nil {
			err = errors.Join(errors.New("task not exist"), dataErr)
			return
		}
		if data.Done == req.Done {
			return
		}
		data.Done = req.Done
		if err = db.UpdateTask(db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask), data); err != nil {
			return
		}
		// 与 changeTask 一致：从完成改回未完成时要放回未完成缓存。
		if !req.Done {
			err = subGroup.RefreshCache(task)
		}
	}, func() { err = errors.New("user not exist") })
	return
}

// OnGetOverview 只读汇总。持锁只做内存目录树快照，D1 查询都在锁外并发执行，
// 避免几次网络往返期间挡住同一用户的其他操作。读到的是一瞬间之前的状态，对汇总无影响。
//
// 任务只查收藏涉及的分组（D1 读取按行计费，全查再筛曾经差点打满每日额度），
// 查回来的不一定都算数：删分组是软删、删子分组是硬删，都不会处理下面的任务；父任务完成后
// 子任务在库里也仍是未完成。所以只认活着的分组下的子分组，再丢掉父链断掉的子任务。
func (s *Service) OnGetOverview(_ backendshare.Valid, req GetOverviewReq) (ret GetOverviewRet, err error) {
	var groups []logic.GroupSnapshot
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		groups, err = user.SnapshotGroups()
	}, func() { err = errors.New("user not exist") })
	if err != nil {
		return
	}

	groupByID := make(map[uint32]logic.GroupSnapshot)
	groupIDs := make([]uint32, 0)
	for _, g := range groups {
		if g.Type != db.GroupTypeNormal && g.Type != db.GroupTypeRoutine {
			continue
		}
		groupByID[g.ID] = g
		groupIDs = append(groupIDs, g.ID)
	}

	conn := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	if conn == nil {
		return ret, errors.New("get connect failed")
	}

	// 五个查询彼此独立，一起并发发出，整个请求只等一轮 D1 往返。
	var (
		subGroups []db.SubGroupDB
		favorites []db.GroupFavoriteDB
		tags      []db.TagsDB
		nodes     []db.RoutineNodeDB
		tasks     []db.TaskDB
		errs      [5]error
		wg        sync.WaitGroup
	)
	wg.Add(5)
	go func() { defer wg.Done(); subGroups, errs[0] = db.GetSubGroupsByGroupIDs(conn, groupIDs) }()
	go func() { defer wg.Done(); favorites, errs[1] = db.GetGroupFavorites(conn, req.UserID) }()
	go func() { defer wg.Done(); tags, errs[2] = db.GetTagsByUser(conn, req.UserID) }()
	go func() { defer wg.Done(); nodes, errs[3] = db.GetRoutineNodesByUser(conn, req.UserID) }()
	go func() { defer wg.Done(); tasks, errs[4] = db.GetUnfinishedTasksInFavoriteGroups(conn, req.UserID) }()
	wg.Wait()
	if err = errors.Join(errs[:]...); err != nil {
		return
	}
	sort.SliceStable(subGroups, func(i, j int) bool { return subGroups[i].Index < subGroups[j].Index })

	favGroup := make(map[uint32]bool)
	favSubGroup := make(map[uint32]bool)
	for _, f := range favorites {
		if f.SubGroupID == 0 {
			favGroup[f.GroupID] = true
		} else {
			favSubGroup[f.SubGroupID] = true
		}
	}
	favTouched := make(map[uint32]bool) // 整个收藏或收藏了其中某一栏的分组
	for _, f := range favorites {
		favTouched[f.GroupID] = true
	}
	flagged := make(map[uint32]bool)
	for _, t := range tags {
		if t.Tag == flagTag {
			flagged[t.TaskID] = true
		}
	}

	ret.Groups = make([]OverviewGroup, 0, len(groupIDs))
	for _, id := range groupIDs {
		g := groupByID[id]
		ret.Groups = append(ret.Groups, OverviewGroup{
			DirID: g.DirID, GroupID: g.ID, Type: int(g.Type), Title: g.Title, Path: g.Path,
		})
	}

	ret.SubGroups = make([]OverviewSubGroup, 0, len(subGroups))
	subGroupGroup := make(map[uint32]uint32) // 只含活着的分组下的子分组
	sequences := make(map[uint32]logic.MapIdTree)
	for _, sg := range subGroups {
		subGroupGroup[sg.ID] = sg.ParentGroupID
		ret.SubGroups = append(ret.SubGroups, OverviewSubGroup{ID: sg.ID, GroupID: sg.ParentGroupID, Title: sg.Title, Index: sg.Index})
		seq := make(logic.MapIdTree)
		if seq.FromJSON(sg.TaskSequence) == nil {
			sequences[sg.ID] = seq
		}
	}

	// 父链完整的任务才算数（父任务也得在未完成集合里，且同一子分组）。
	byID := make(map[uint32]*db.TaskDB, len(tasks))
	for i := range tasks {
		byID[tasks[i].TaskID] = &tasks[i]
	}
	alive := make(map[uint32]bool, len(tasks))
	var isAlive func(t *db.TaskDB, depth int) bool
	isAlive = func(t *db.TaskDB, depth int) bool {
		if v, ok := alive[t.TaskID]; ok {
			return v
		}
		ok := true
		if t.ParentTaskID != 0 {
			parent := byID[t.ParentTaskID]
			ok = depth < 64 && parent != nil && parent.ParentSubGroupID == t.ParentSubGroupID && isAlive(parent, depth+1)
		}
		alive[t.TaskID] = ok
		return ok
	}

	ret.Tasks = make([]OverviewTask, 0)
	for i := range tasks {
		t := &tasks[i]
		groupID := subGroupGroup[t.ParentSubGroupID]
		g, ok := groupByID[groupID]
		if !ok || !isAlive(t, 0) {
			continue
		}
		// 只返回收藏范围内的任务。例行清单只要被收藏到（哪怕只收藏了一栏）就整张返回：
		// 节奏层可能挂在清单上，前端要拿到全部事项才能算对这一期的状态。
		favorite := favGroup[groupID] || favSubGroup[t.ParentSubGroupID]
		if !favorite && !(g.Type == db.GroupTypeRoutine && favTouched[groupID]) {
			continue
		}
		parentTitle := ""
		if p := byID[t.ParentTaskID]; p != nil {
			parentTitle = p.Title
		}
		index := float32(1e9 + float64(t.TaskID)) // 不在顺序里的排到最后
		if seq, ok := sequences[t.ParentSubGroupID]; ok {
			if found, idx := seq.GetSequence(t.ParentTaskID, t.TaskID); found {
				index = float32(idx)
			}
		}
		var taskTags []string
		if flagged[t.TaskID] {
			taskTags = []string{flagTag}
		}
		ret.Tasks = append(ret.Tasks, OverviewTask{
			GroupID: groupID, SubGroupID: t.ParentSubGroupID, ParentTitle: parentTitle,
			Task: protocol.PTask{
				ID: t.TaskID, Title: t.Title, Index: index, Tags: taskTags, Done: t.Done, ParentID: t.ParentTaskID,
				TaskType: int(t.TaskType), Started: t.Started, BeginTime: t.BeginTime, EndTime: t.EndTime, Wait4: t.Wait4,
			},
		})
	}

	// 收藏项：分组或子分组已经删掉的不返回（行留着无害）。
	ret.Favorites = make([]OverviewFavorite, 0, len(favorites))
	for _, f := range favorites {
		if _, ok := groupByID[f.GroupID]; !ok {
			continue
		}
		if f.SubGroupID != 0 && subGroupGroup[f.SubGroupID] != f.GroupID {
			continue
		}
		ret.Favorites = append(ret.Favorites, OverviewFavorite{GroupID: f.GroupID, SubGroupID: f.SubGroupID})
	}

	ret.RoutineNodes = make([]OverviewRoutineNode, 0)
	for _, n := range nodes {
		if g, ok := groupByID[n.GroupID]; !ok || g.Type != db.GroupTypeRoutine {
			continue
		}
		ret.RoutineNodes = append(ret.RoutineNodes, OverviewRoutineNode{
			GroupID: n.GroupID,
			Node: protocol.PRoutineNode{
				Kind: uint8(n.Kind), NodeID: n.NodeID, Folder: n.Folder, Optional: n.Optional, Temp: n.Temp, Paused: n.Paused,
				Rule: n.Rule, Mark: n.Mark, PrevMark: n.PrevMark,
			},
		})
	}
	return
}
