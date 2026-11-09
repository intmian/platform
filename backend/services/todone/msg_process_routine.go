package todone

import (
	"errors"

	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/logic"
	"github.com/intmian/platform/backend/services/todone/protocol"
	backendshare "github.com/intmian/platform/backend/share"
)

const (
	maxRoutineRuleBytes  = 2048
	maxRoutineMarkBytes  = 64
	maxRoutineBatchNodes = 2000
)

func getRoutineGroup(user *logic.UserLogic, dirID, groupID uint32) (*logic.GroupLogic, error) {
	group := user.GetGroupLogic(dirID, groupID)
	if group == nil {
		return nil, errors.New("group not exist")
	}
	groupData, err := group.GetGroupData()
	if err != nil || groupData == nil {
		return nil, errors.New("group not exist")
	}
	if groupData.Type != db.GroupTypeRoutine {
		return nil, errors.New("group is not routine")
	}
	return group, nil
}

// routineTaskInSubGroup 只读校验任务归属。
// 不能用 SubGroupLogic.GetTaskLogic：它会把未缓存的任务追加进子分组排序，
// 导致带有其他子分组任务的非法请求在被拒绝前就污染 taskSequence。
func routineTaskInSubGroup(userID string, subGroup *logic.SubGroupLogic, taskID uint32) bool {
	task, err := db.GetTaskByID(db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask), taskID)
	return err == nil && task != nil && task.UserID == userID && !task.Deleted && task.ParentSubGroupID == subGroup.GetID()
}

func validateRoutineNode(userID string, group *logic.GroupLogic, groupID uint32, node protocol.PRoutineNode) error {
	if len(node.Rule) > maxRoutineRuleBytes {
		return errors.New("routine rule too large")
	}
	if len(node.Mark) > maxRoutineMarkBytes || len(node.PrevMark) > maxRoutineMarkBytes {
		return errors.New("routine mark too large")
	}
	switch db.RoutineNodeKind(node.Kind) {
	case db.RoutineNodeGroup:
		if node.NodeID != groupID {
			return errors.New("routine group node mismatch")
		}
	case db.RoutineNodeSubGroup:
		if group.GetSubGroupLogic(node.NodeID) == nil {
			return errors.New("sub group not exist")
		}
	case db.RoutineNodeTask:
		subGroup := group.GetSubGroupLogic(node.SubGroupID)
		if subGroup == nil {
			return errors.New("sub group not exist")
		}
		if !routineTaskInSubGroup(userID, subGroup, node.NodeID) {
			return errors.New("task not exist")
		}
	default:
		return errors.New("routine node kind invalid")
	}
	return nil
}

func (s *Service) OnGetRoutine(_ backendshare.Valid, req GetRoutineReq) (ret GetRoutineRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		if _, groupErr := getRoutineGroup(user, req.DirID, req.GroupID); groupErr != nil {
			err = groupErr
			return
		}
		nodes, getErr := db.GetRoutineNodes(db.GTodoneDBMgr.GetConnect(db.ConnectTypeRoutine), req.UserID, req.GroupID)
		if getErr != nil {
			err = getErr
			return
		}
		ret.Nodes = make([]protocol.PRoutineNode, 0, len(nodes))
		for _, node := range nodes {
			ret.Nodes = append(ret.Nodes, protocol.PRoutineNode{
				Kind: uint8(node.Kind), NodeID: node.NodeID, Folder: node.Folder, Optional: node.Optional, Temp: node.Temp,
				Rule: node.Rule, Mark: node.Mark, PrevMark: node.PrevMark,
			})
		}
	}, func() { err = errors.New("user not exist") })
	return
}

func (s *Service) OnSaveRoutine(_ backendshare.Valid, req SaveRoutineReq) (ret SaveRoutineRet, err error) {
	if len(req.Nodes) > maxRoutineBatchNodes {
		return ret, errors.New("too many routine nodes")
	}
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		group, groupErr := getRoutineGroup(user, req.DirID, req.GroupID)
		if groupErr != nil {
			err = groupErr
			return
		}
		conn := db.GTodoneDBMgr.GetConnect(db.ConnectTypeRoutine)

		// 先完整校验，再落库，避免半途失败造成部分写入。
		deleted := make(map[uint32]bool)
		for _, del := range req.DelTasks {
			subGroup := group.GetSubGroupLogic(del.SubGroupID)
			if subGroup == nil {
				err = errors.New("sub group not exist")
				return
			}
			for _, taskID := range del.TaskIDs {
				if !routineTaskInSubGroup(req.UserID, subGroup, taskID) {
					err = errors.New("task not exist")
					return
				}
				deleted[taskID] = true
			}
		}
		nodes := make([]db.RoutineNodeDB, 0, len(req.Nodes))
		for _, node := range req.Nodes {
			if db.RoutineNodeKind(node.Kind) == db.RoutineNodeTask && deleted[node.NodeID] {
				continue
			}
			if validateErr := validateRoutineNode(req.UserID, group, req.GroupID, node); validateErr != nil {
				err = validateErr
				return
			}
			nodes = append(nodes, db.RoutineNodeDB{
				UserID: req.UserID, GroupID: req.GroupID, Kind: db.RoutineNodeKind(node.Kind), NodeID: node.NodeID,
				Folder: node.Folder, Optional: node.Optional, Temp: node.Temp, Rule: node.Rule, Mark: node.Mark, PrevMark: node.PrevMark,
			})
		}

		for _, del := range req.DelTasks {
			if len(del.TaskIDs) == 0 {
				continue
			}
			if delErr := group.GetSubGroupLogic(del.SubGroupID).OnDeleteTasks(del.TaskIDs); delErr != nil {
				err = errors.Join(errors.New("delete routine tasks failed"), delErr)
				return
			}
			if delErr := db.DeleteRoutineNodes(conn, req.UserID, db.RoutineNodeTask, del.TaskIDs); delErr != nil {
				err = errors.Join(errors.New("delete routine nodes failed"), delErr)
				return
			}
		}
		if saveErr := db.SaveRoutineNodes(conn, nodes); saveErr != nil {
			err = errors.Join(errors.New("save routine nodes failed"), saveErr)
		}
	}, func() { err = errors.New("user not exist") })
	return
}
