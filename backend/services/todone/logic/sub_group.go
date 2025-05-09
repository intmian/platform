package logic

import (
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"sort"
	"time"

	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
)

type SubGroupLogic struct {
	dbData *db.SubGroupDB

	unFinTasksCache map[uint32]*TaskLogic
	taskSequence    MapIdTree
}

func NewSubGroupLogic(dbData *db.SubGroupDB) *SubGroupLogic {
	return &SubGroupLogic{
		dbData:          dbData,
		unFinTasksCache: make(map[uint32]*TaskLogic),
		taskSequence:    make(MapIdTree),
	}
}

func (s *SubGroupLogic) GetID() uint32 {
	return s.dbData.ID
}

func (s *SubGroupLogic) ToProtocol() protocol.PSubGroup {
	return protocol.PSubGroup{
		ID:    s.dbData.ID,
		Title: s.dbData.Title,
		Note:  s.dbData.Note,
		Index: s.dbData.Index,
	}
}

func (s *SubGroupLogic) GetTasks(containDone bool) ([]*TaskLogic, error) {
	if !containDone {
		if s.unFinTasksCache != nil && len(s.unFinTasksCache) > 0 {
			res := make([]*TaskLogic, 0)
			for _, task := range s.unFinTasksCache {
				if task.dbData.Done {
					// 如果任务被完成不会刷新缓存，而且为了方便用户找回也只是在这里做下屏蔽，sequence也不刷新，等到下次大重启才会消失。
					continue
				}
				task.BindOutIndex(s.taskSequence.GetSequenceOrAdd(task.dbData.ParentTaskID, task.dbData.TaskID))
				res = append(res, task)
			}
			return res, nil
		}
	}

	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	tasksDB := db.GetTasksByParentSubGroupID(connect, s.dbData.ID, 0, 0, containDone)

	var res []*TaskLogic
	for _, taskDB := range tasksDB {
		newDB := taskDB
		task := NewTaskLogic(newDB.TaskID)
		task.OnBindOutData(&newDB)
		res = append(res, task)
	}

	// 加载所有的tag
	taskIds := make([]uint32, 0)
	for _, task := range res {
		taskIds = append(taskIds, task.dbData.TaskID)
	}
	connTag := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTags)
	if connTag == nil {
		return nil, errors.New("connTag is nil")
	}
	tags := db.GetTagsByMultipleTaskID(connTag, taskIds)
	for _, task := range res {
		if task.dbData.TaskID == 0 {
			continue
		}
		if tag, ok := tags[task.dbData.TaskID]; ok {
			task.BindOutTags(tag)
		}
	}

	if containDone {
		err := s.buildTreeWithoutData()
		if err != nil {
			return nil, err
		}
		for _, task := range res {
			if !task.dbData.Done {
				task.BindOutIndex(s.taskSequence.GetSequenceOrAdd(task.dbData.ParentTaskID, task.dbData.TaskID))
			} else {
				task.BindOutIndex(int(task.id + 9999999))
			}
		}
		return res, nil
	}

	// 处理缓存
	for _, task := range res {
		s.unFinTasksCache[task.dbData.TaskID] = task
	}

	// 处理序列
	err := s.buildSequence(res)
	if err != nil {
		return nil, err
	}
	return res, nil
}

func (s *SubGroupLogic) NeedBuildSequence() bool {
	return len(s.taskSequence) == 0
}

func (s *SubGroupLogic) buildSequence(res []*TaskLogic) error {
	// 重整任务序列，首先遍历所有Cache，根据parantID分组，以创建时间排序，为他们获取Index并添加进sequence。再遍历sequence，删除掉再Cache中不存在的部分。
	// 最后落盘
	parent2Task := make(map[uint32][]*TaskLogic)
	for _, task := range res {
		if _, ok := parent2Task[task.dbData.ParentTaskID]; !ok {
			parent2Task[task.dbData.ParentTaskID] = make([]*TaskLogic, 0)
		}
		parent2Task[task.dbData.ParentTaskID] = append(parent2Task[task.dbData.ParentTaskID], task)
	}
	// 先排序
	for _, tasks := range parent2Task {
		sort.Slice(tasks, func(i, j int) bool {
			return tasks[i].dbData.CreatedAt.Before(tasks[j].dbData.CreatedAt)
		})
	}
	// 再获取Index
	for _, tasks := range parent2Task {
		for _, task := range tasks {
			task.BindOutIndex(s.taskSequence.GetSequenceOrAdd(task.dbData.ParentTaskID, task.dbData.TaskID))
		}
	}
	// 最后遍历Map，删除掉再Cache中不存在的部分
	for parentID, tasks := range parent2Task {
		existIds := make([]uint32, 0)
		for _, task := range tasks {
			existIds = append(existIds, task.dbData.TaskID)
		}
		s.taskSequence.RemoveNotExist(parentID, existIds)
	}

	// 最后落盘
	newSequence, err := s.taskSequence.JSON()
	if err != nil {
		return errors.Join(err, errors.New("taskSequence JSON error"))
	}
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	err = db.UpdateSubGroup(connect, s.dbData.ID, s.dbData.Title, s.dbData.Note, s.dbData.Index, newSequence)
	if err != nil {
		return errors.Join(err, errors.New("UpdateSubGroup error"))
	}
	return nil
}

func (s *SubGroupLogic) Save() error {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	err := db.UpdateSubGroup(connect, s.dbData.ID, s.dbData.Title, s.dbData.Note, s.dbData.Index, s.dbData.TaskSequence)
	if err != nil {
		return err
	}
	return nil
}

func (s *SubGroupLogic) CreateTask(userID string, title, note string, taskType db.TaskType, Started bool, parentTaskID uint32) (*TaskLogic, error) {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	ID, err := db.CreateTask(connect, userID, s.dbData.ID, 0, title, note, Started)
	if err != nil {
		return nil, err
	}
	task := NewTaskLogic(ID)
	task.OnBindOutData(&db.TaskDB{
		TaskID:           ID,
		ParentSubGroupID: s.dbData.ID,
		Title:            title,
		Note:             note,
		TaskType:         taskType,
		Deleted:          false,
		Done:             false,
		Started:          Started,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
		ParentTaskID:     parentTaskID,
	})

	// 更新缓存和序列
	if s.unFinTasksCache != nil {
		s.unFinTasksCache[task.dbData.TaskID] = task
		task.BindOutIndex(s.taskSequence.GetSequenceOrAdd(parentTaskID, task.dbData.TaskID))
		err = s.Save()
		if err != nil {
			return nil, err
		}
	}

	return task, nil
}

func (s *SubGroupLogic) Delete() error {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	err := db.DeleteSubGroup(connect, s.dbData.ID)
	if err != nil {
		return err
	}
	return nil
}

func (s *SubGroupLogic) ChangeFromProtocol(data protocol.PSubGroup) error {
	if s.dbData.Title != data.Title {
		s.dbData.Title = data.Title
	}
	if s.dbData.Note != data.Note {
		s.dbData.Note = data.Note
	}
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	return db.UpdateSubGroup(connect, s.dbData.ID, s.dbData.Title, s.dbData.Note, s.dbData.Index, s.dbData.TaskSequence)
}

func (s *SubGroupLogic) BeforeTaskMove(taskIDs []uint32, newParentID uint32) (MapIdTree, []uint32, []uint32) {
	// 获取所有的任务
	tasks, err := s.GetTasks(true)
	if err != nil {
		return nil, nil, nil
	}
	err = s.buildTreeWithoutData()
	if err != nil {
		return nil, nil, nil
	}

	// 构建 taskID -> *TaskLogic 映射
	taskMap := make(map[uint32]*TaskLogic)
	for _, t := range tasks {
		taskData, _ := t.GetTaskData()
		taskMap[taskData.TaskID] = t
	}

	// 递归收集所有要移动的任务及其子任务
	moveSet := make(map[uint32]struct{})
	var collect func(ids []uint32)
	collect = func(ids []uint32) {
		for _, id := range ids {
			if _, ok := moveSet[id]; ok {
				continue
			}
			moveSet[id] = struct{}{}
			for _, t := range tasks {
				taskData, _ := t.GetTaskData()
				if taskData.ParentTaskID == id {
					collect([]uint32{taskData.TaskID})
				}
			}
		}
	}
	collect(taskIDs)

	// 分类：父节点也被移动的（无需更改父节点），父节点未被移动的（需要更改父节点）
	needChangeParent := make([]uint32, 0)
	noNeedChangeParent := make([]uint32, 0)
	for id := range moveSet {
		task := taskMap[id]
		if task == nil {
			continue
		}
		taskData, _ := task.GetTaskData()
		if taskData.ParentTaskID != 0 {
			if _, parentMoved := moveSet[taskData.ParentTaskID]; parentMoved {
				noNeedChangeParent = append(noNeedChangeParent, id)
			} else {
				needChangeParent = append(needChangeParent, id)
			}
		} else {
			// 根任务
			noNeedChangeParent = append(noNeedChangeParent, id)
		}
	}

	// 生成新的任务序列，保证移动后顺序不变，如果需要修改。
	// noNeedChangeParent 根据传入的 taskIDs中的顺序来排序
	oldOrder := make(map[uint32]int)
	for i, taskID := range taskIDs {
		oldOrder[taskID] = i
	}
	sort.Slice(noNeedChangeParent, func(i, j int) bool {
		id1, id2 := noNeedChangeParent[i], noNeedChangeParent[j]
		index1, ok1 := oldOrder[id1]
		index2, ok2 := oldOrder[id2]
		if ok1 && ok2 {
			return index1 < index2
		}
		return false
	})
	seq := make(MapIdTree)
	for _, task := range noNeedChangeParent {
		seq.Add(newParentID, task)
	}
	// 不需要更改父节点的任务ID，根据原来的顺序来排序，不管是否完成因为多加的会被删掉
	for _, taskID := range noNeedChangeParent {
		task := s.GetTaskLogic(taskID)
		if task == nil {
			continue
		}
		if _, ok := seq[task.dbData.ParentTaskID]; ok {
			continue
		}
		seq[task.dbData.ParentTaskID] = s.taskSequence[task.dbData.ParentTaskID]
	}

	// 从缓存中删除已经移动的任务
	for _, taskID := range taskIDs {
		if _, ok := s.unFinTasksCache[taskID]; ok {
			delete(s.unFinTasksCache, taskID)
		}
	}
	// 更新序列
	newTasks, err := s.GetTasks(false)
	if err != nil {
		return nil, nil, nil
	}
	err = s.buildSequence(newTasks)
	if err != nil {
		return nil, nil, nil
	}

	// 返回：新的序列、需要更改父节点的任务ID、无需更改父节点的任务ID
	return seq, needChangeParent, noNeedChangeParent
}

func (s *SubGroupLogic) AfterTaskMove(seq MapIdTree, needChangeParent, noNeedChangeParent []uint32, newParentID, newAfterID uint32, after bool) error {
	err := s.buildTreeWithoutData()
	if err != nil {
		return err
	}

	// 批量更改所有的任务的parentsubgroup和原生任务parentTaskIDs。
	allIDs := make([]uint32, 0)
	for _, taskID := range needChangeParent {
		allIDs = append(allIDs, taskID)
	}
	for _, taskID := range noNeedChangeParent {
		allIDs = append(allIDs, taskID)
	}
	conn := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	err = db.UpdateTasksParentTaskID(conn, newParentID, needChangeParent)
	if err != nil {
		return errors.Join(err, errors.New("UpdateTasksParentTaskID error"))
	}
	err = db.UpdateTasksSubGroupID(conn, s.dbData.ID, allIDs)
	if err != nil {
		return errors.Join(err, errors.New("UpdateTasksSubGroupID error"))
	}

	// 合并序列
	rootSet := misc.NewSet[uint32]()
	rootSet.FromSlice(noNeedChangeParent)
	// 先插入子任务们
	for parentID, tasks := range seq {
		for _, taskID := range tasks {
			if rootSet.Contains(taskID) {
				continue
			}
			if _, ok := s.taskSequence[parentID]; !ok {
				s.taskSequence[parentID] = make([]uint32, 0)
			}
			s.taskSequence[parentID] = append(s.taskSequence[parentID], taskID)
		}
	}
	// 再插入父任务们，如果newAfterID =0，那就根据after，插入到0节点的最前面或者最后面。否则插入到newAfterID的前面或者后面
	newSequence, ok := s.taskSequence[newParentID]
	if !ok {
		s.taskSequence[newParentID] = make([]uint32, 0)
		for _, taskID := range noNeedChangeParent {
			s.taskSequence[newParentID] = append(s.taskSequence[newParentID], taskID)
		}
	} else {
		if newAfterID == 0 {
			if after {
				s.taskSequence[newParentID] = append(s.taskSequence[newParentID], noNeedChangeParent...)
			} else {
				s.taskSequence[newParentID] = append(noNeedChangeParent, s.taskSequence[newParentID]...)
			}
		} else {
			newSeq := make([]uint32, 0)
			for _, taskID := range newSequence {
				if taskID == newAfterID {
					if after {
						newSeq = append(newSeq, taskID)
						newSeq = append(newSeq, noNeedChangeParent...)
					} else {
						newSeq = append(newSeq, noNeedChangeParent...)
						newSeq = append(newSeq, taskID)
					}
				} else {
					newSeq = append(newSeq, taskID)
				}
			}
			s.taskSequence[newParentID] = newSeq
		}
	}

	// 重建缓存和序列
	err = s.buildTreeWithoutData()
	if err != nil {
		return errors.Join(err, errors.New("buildTreeWithoutData error"))
	}
	//// 获取所有的任务
	//res := make([]protocol.PTask, 0)
	//for _, allID := range allIDs {
	//	task := s.GetTaskLogic(allID)
	//	if task == nil {
	//		continue
	//	}
	//	res = append(res, task.ToProtocol())
	//}
	return nil
}

func (s *SubGroupLogic) buildTreeWithoutData() error {
	tasks, err := s.GetTasks(false)
	if err != nil {
		return errors.Join(err, errors.New("GetTasks error"))
	}
	err = s.buildSequence(tasks)
	if err != nil {
		return errors.Join(err, errors.New("buildSequence error"))
	}
	return nil
}

func (s *SubGroupLogic) OnDeleteTasks(taskIDs []uint32) error {
	hasUnFin := false
	for _, taskID := range taskIDs {
		task := NewTaskLogic(taskID)
		err := task.Delete()
		if err != nil {
			return err
		}
		if !task.dbData.Done {
			hasUnFin = true
		}
	}
	// 如果存在未完成的任务，则删除缓存并且删除序列
	if hasUnFin {
		if s.unFinTasksCache == nil {
			err := s.buildTreeWithoutData()
			if err != nil {
				return errors.Join(err, errors.New("buildTreeWithoutData error"))
			}
		}

		if s.unFinTasksCache != nil {
			for _, taskID := range taskIDs {
				if _, ok := s.unFinTasksCache[taskID]; ok {
					delete(s.unFinTasksCache, taskID)
				}
			}

			datas := make([]*TaskLogic, 0)
			for _, task := range s.unFinTasksCache {
				datas = append(datas, task)
			}
			err := s.buildSequence(datas)
			if err != nil {
				return errors.Join(err, errors.New("buildSequence error"))
			}
		}
	}

	return nil
}

func (s *SubGroupLogic) GetTaskLogic(id uint32) *TaskLogic {
	if s.unFinTasksCache == nil {
		s.unFinTasksCache = make(map[uint32]*TaskLogic)
	}
	if task, ok := s.unFinTasksCache[id]; ok {
		return task
	}
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	taskDB, err := db.GetTaskByID(connect, id)
	if err != nil {
		return nil
	}
	task := NewTaskLogic(id)
	task.OnBindOutData(taskDB)
	if taskDB.Deleted {
		return nil
	}

	task.BindOutIndex(s.taskSequence.GetSequenceOrAdd(taskDB.ParentTaskID, taskDB.TaskID))
	return task
}
