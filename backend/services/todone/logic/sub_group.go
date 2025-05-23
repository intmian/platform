package logic

import (
	"context"
	"errors"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
	"sort"
	"time"
)

type SubGroupLogic struct {
	dbData *db.SubGroupDB

	unFinTasksCache map[uint32]*TaskLogic
	taskSequence    MapIdTree
}

type AutoSave struct {
	LastSave db.SubGroupDB
	SaveTime time.Time
	realData *db.SubGroupDB
	ctx      context.Context
}

func (a *AutoSave) Init(data *db.SubGroupDB, ctx context.Context) {
	a.LastSave = *data
	a.SaveTime = time.Now()
	a.realData = data
	a.ctx = ctx

	go func() {
		for {
			select {
			case <-a.ctx.Done():
				if a.NeedSave() {
					a.Save()
				}
				return
			default:
				// do nothing
			}
			time.Sleep(5 * time.Second)
			if a.NeedSave() {
				a.Save()
			}
		}
	}()
}

func NewAutoSave(data *db.SubGroupDB, ctx context.Context) *AutoSave {
	autoSave := &AutoSave{}
	autoSave.Init(data, ctx)
	return autoSave
}

func (a *AutoSave) NeedSave() bool {
	if a.realData == nil {
		return false
	}
	if a.LastSave.Title != a.realData.Title ||
		a.LastSave.Note != a.realData.Note ||
		a.LastSave.Index != a.realData.Index ||
		a.LastSave.TaskSequence != a.realData.TaskSequence ||
		a.LastSave.ParentGroupID != a.realData.ParentGroupID {
		return true
	}
	return false
}

func (a *AutoSave) Save() {
	if a.realData == nil {
		return
	}
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	err := db.UpdateSubGroup(connect, a.realData.ID, a.realData.Title, a.realData.Note, a.realData.Index, a.realData.TaskSequence)
	if err != nil {
		GTodoneShare.Log.ErrorErr("todone.subgtoup.auto", errors.Join(err, errors.New("AutoSave Save error")))
		return
	}
	GTodoneShare.Log.Info("todone.subgtoup.auto", "AutoSave Save success %v", a.realData)
	a.LastSave = *a.realData
	a.SaveTime = time.Now()
}

func NewSubGroupLogic(dbData *db.SubGroupDB) *SubGroupLogic {
	tree := make(MapIdTree)
	err := tree.FromJSON(dbData.TaskSequence)
	if err != nil {
		return nil
	}
	NewAutoSave(dbData, GTodoneCtx)
	return &SubGroupLogic{
		dbData:          dbData,
		unFinTasksCache: make(map[uint32]*TaskLogic),
		taskSequence:    tree,
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
		if len(s.taskSequence) > 0 && len(s.unFinTasksCache) > 0 {
			return s.GetTasksByCache()
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
		if s.taskSequence == nil {
			err := s.buildSequenceWithLoadData()
			if err != nil {
				return nil, err
			}
		}

		for _, task := range res {
			if !task.dbData.Done {
				_, index := s.taskSequence.GetSequence(task.dbData.ParentTaskID, task.dbData.TaskID)
				task.BindOutIndex(index)
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

	// 从缓存中递归删除父任务不存在的子孙任务
	s.clearFinishCache()

	return s.GetTasksByCache()
}

func (s *SubGroupLogic) GetTasksByCache() ([]*TaskLogic, error) {
	res := make([]*TaskLogic, 0)

	needSave := false
	for _, task := range s.unFinTasksCache {
		if task.dbData.Done {
			// 如果任务被完成不会刷新缓存，而且为了方便用户找回也只是在这里做下屏蔽，sequence也不刷新，等到下次大重启才会消失。
			continue
		}
		ok, index := s.taskSequence.GetSequence(task.dbData.ParentTaskID, task.dbData.TaskID)
		if !ok {
			index = s.taskSequence.GetSequenceOrAdd(task.dbData.ParentTaskID, task.dbData.TaskID)
			needSave = true
		}
		task.BindOutIndex(index)
		res = append(res, task)
	}
	if needSave {
		err := s.OnChangeSeq()
		if err != nil {
			return nil, errors.Join(err, errors.New("OnChangeSeq error"))
		}
	}
	return res, nil
}

func (s *SubGroupLogic) clearFinishCache() {
	if s.unFinTasksCache == nil {
		return
	}
	parentID2childrenID := make(map[uint32][]uint32)
	for _, task := range s.unFinTasksCache {
		parentID2childrenID[task.dbData.ParentTaskID] = append(parentID2childrenID[task.dbData.ParentTaskID], task.dbData.TaskID)
	}
	var deleteCache func(taskID uint32)
	deleteCache = func(taskID uint32) {
		if _, ok := s.unFinTasksCache[taskID]; ok {
			delete(s.unFinTasksCache, taskID)
		}
		if children, ok := parentID2childrenID[taskID]; ok {
			for _, childID := range children {
				deleteCache(childID)
			}
		}
	}
	for taskID, task := range s.unFinTasksCache {
		// 如果父节点不存在，则删除
		parentID := task.dbData.ParentTaskID
		if parentID == 0 {
			continue
		}
		if _, ok := s.unFinTasksCache[parentID]; !ok {
			deleteCache(taskID)
		}
	}
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

	set := misc.NewSet[uint32]()
	for _, task := range res {
		if task.dbData.Done {
			continue
		}
		set.Add(task.dbData.TaskID)
	}
	set.Add(0)

	for parentID, _ := range s.taskSequence {
		if !set.Contains(parentID) {
			s.taskSequence.RemoveAsParent(parentID)
		}
		// 如果子任务都被完成了也不用存这个了
		if _, ok := parent2Task[parentID]; !ok {
			s.taskSequence.RemoveAsParent(parentID)
		}
	}

	err := s.OnChangeSeq()
	if err != nil {
		return errors.Join(err, errors.New("OnChangeSeq error"))
	}
	return nil
}

func (s *SubGroupLogic) OnChangeSeq() error {
	// 最后落盘
	newSequence, err := s.taskSequence.JSON()
	if err != nil {
		return errors.Join(err, errors.New("taskSequence JSON error"))
	}
	s.dbData.TaskSequence = newSequence
	return s.Save()
}

func (s *SubGroupLogic) Save() error {
	// DO NOTHING，尝试下自动保存
	//connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	//err := db.UpdateSubGroup(connect, s.dbData.ID, s.dbData.Title, s.dbData.Note, s.dbData.Index, s.dbData.TaskSequence)
	//if err != nil {
	//	return err
	//}
	return nil
}

func (s *SubGroupLogic) CreateTask(userID string, title, note string, taskType db.TaskType, Started bool, parentTaskID uint32) (*TaskLogic, error) {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	taskDB, err := db.CreateTask(connect, userID, s.dbData.ID, parentTaskID, title, note, Started)
	if taskDB == nil || err != nil {
		return nil, err
	}
	task := NewTaskLogic(taskDB.TaskID)
	task.OnBindOutData(taskDB)
	task.BindOutTags(make([]string, 0))

	// 更新缓存和序列
	if s.unFinTasksCache != nil {
		s.unFinTasksCache[task.dbData.TaskID] = task
		task.BindOutIndex(s.taskSequence.GetSequenceOrAdd(parentTaskID, task.dbData.TaskID))
		err = s.OnChangeSeq()
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
	err = s.buildSequence(tasks)
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
	moveSet := misc.NewSet[uint32]()
	var collect func(ids []uint32)
	collect = func(ids []uint32) {
		for _, id := range ids {
			if !moveSet.Contains(id) {
				moveSet.Add(id)
			}
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
			needChangeParent = append(needChangeParent, id)
		}
	}

	// 生成新的任务序列，保证移动后顺序不变，如果需要修改。
	// NeedChangeParent 根据传入的 taskIDs中的顺序来排序
	oldOrder := make(map[uint32]int)
	for i, taskID := range taskIDs {
		oldOrder[taskID] = i
	}
	sort.Slice(needChangeParent, func(i, j int) bool {
		id1, id2 := needChangeParent[i], needChangeParent[j]
		index1, ok1 := oldOrder[id1]
		index2, ok2 := oldOrder[id2]
		if ok1 && ok2 {
			return index1 < index2
		}
		return false
	})
	seq := make(MapIdTree)

	// 需要更改父节点的任务ID，直接添加到新的父节点下，按照客户端传入顺序
	for _, task := range needChangeParent {
		seq.Add(newParentID, task)
	}
	// 不需要更改父节点的任务ID，根据原来的顺序来排序，不管是否完成因为多加的会被删掉
	for _, taskID := range noNeedChangeParent {
		task := s.GetTaskLogic(taskID)
		if task == nil {
			continue
		}
		if _, ok := s.taskSequence[task.dbData.ParentTaskID]; ok {
			continue
		}
		seq[task.dbData.ParentTaskID] = s.taskSequence[task.dbData.ParentTaskID]
	}

	for parentID, children := range s.taskSequence {
		if moveSet.Contains(parentID) {
			s.taskSequence.RemoveAsParent(parentID)
			continue
		}

		newChildren := make([]uint32, 0)
		for _, childID := range children {
			if !moveSet.Contains(childID) {
				newChildren = append(newChildren, childID)
			}
		}
		if len(newChildren) > 0 {
			s.taskSequence[parentID] = newChildren
		} else {
			s.taskSequence.RemoveAsParent(parentID)
		}
	}
	err = s.OnChangeSeq()
	if err != nil {
		GTodoneShare.Log.ErrorErr("todone.subgtoup.auto", errors.Join(err, errors.New("OnChangeSeq error")))
		return nil, nil, nil
	}

	// 从缓存中删除已经移动的任务
	for taskID := range moveSet {
		if _, ok := s.unFinTasksCache[taskID]; ok {
			delete(s.unFinTasksCache, taskID)
		}
	}

	// 返回：新的序列、需要更改父节点的任务ID、无需更改父节点的任务ID
	return seq, needChangeParent, noNeedChangeParent
}

func (s *SubGroupLogic) AfterTaskMove(seq MapIdTree, needChangeParent, noNeedChangeParent []uint32, newParentID, newAfterID uint32, after bool) error {
	if s.unFinTasksCache == nil {
		err := s.buildSequenceWithLoadData()
		if err != nil {
			return err
		}
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
	err := db.UpdateTasksParentTaskID(conn, newParentID, needChangeParent)
	if err != nil {
		return errors.Join(err, errors.New("UpdateTasksParentTaskID error"))
	}
	err = db.UpdateTasksSubGroupID(conn, s.dbData.ID, allIDs)
	if err != nil {
		return errors.Join(err, errors.New("UpdateTasksSubGroupID error"))
	}

	// 合并序列
	// 先插入子任务们
	for parentID, tasks := range seq {
		if parentID == newParentID {
			continue
		}
		if _, ok := s.taskSequence[parentID]; !ok {
			s.taskSequence[parentID] = tasks
		} else {
			// 原则上是不可能的
		}
	}
	// 再插入父任务们，如果newAfterID =0，那就根据after，插入到0节点的最前面或者最后面。否则插入到newAfterID的前面或者后面
	parentSec, hasParentSec := seq[newParentID]
	if !hasParentSec {
		return errors.New("newParentID not exist")
	}
	newSequence, ok := s.taskSequence[newParentID]
	if !ok {
		s.taskSequence[newParentID] = parentSec
	} else {
		if newAfterID == 0 {
			if after {
				s.taskSequence[newParentID] = append(s.taskSequence[newParentID], parentSec...)
			} else {
				s.taskSequence[newParentID] = append(parentSec, s.taskSequence[newParentID]...)
			}
		} else {
			newSeq := make([]uint32, 0)
			for _, taskID := range newSequence {
				if taskID == newAfterID {
					if after {
						newSeq = append(newSeq, taskID)
						newSeq = append(newSeq, parentSec...)
					} else {
						newSeq = append(newSeq, parentSec...)
						newSeq = append(newSeq, taskID)
					}
				} else {
					newSeq = append(newSeq, taskID)
				}
			}
			s.taskSequence[newParentID] = newSeq
		}
	}
	err = s.OnChangeSeq()
	if err != nil {
		return errors.Join(err, errors.New("OnChangeSeq error"))
	}

	// 插入缓存
	conn = db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	dbs, err := db.GetTaskByIds(conn, allIDs)
	if err != nil {
		return errors.Join(err, errors.New("GetTaskByIds error"))
	}
	for _, taskDB := range dbs {
		task := NewTaskLogic(taskDB.TaskID)
		task.OnBindOutData(&taskDB)
		if taskDB.Deleted {
			continue
		}
		s.unFinTasksCache[task.dbData.TaskID] = task
		task.BindOutIndex(s.taskSequence.GetSequenceOrAdd(task.dbData.ParentTaskID, task.dbData.TaskID))
	}
	conn = db.GTodoneDBMgr.GetConnect(db.ConnectTypeTags)
	if conn == nil {
		return errors.New("connTag is nil")
	}
	tagsMap := db.GetTagsByMultipleTaskID(conn, allIDs)
	for taskID, tags := range tagsMap {
		if task, ok := s.unFinTasksCache[taskID]; ok {
			task.BindOutTags(tags)
		}
	}
	return nil
}

func (s *SubGroupLogic) buildSequenceWithLoadData() error {
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
			err := s.buildSequenceWithLoadData()
			if err != nil {
				return errors.Join(err, errors.New("buildSequenceWithLoadData error"))
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
	if s.unFinTasksCache != nil {
		if task, ok := s.unFinTasksCache[id]; ok {
			return task
		}
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

func (s *SubGroupLogic) RefreshCache(task *TaskLogic) error {
	// 如果缓存中没有数据，就将其加入缓存，并在下次请求时（加入seq）。
	if s.unFinTasksCache == nil {
		// 没有缓存就不用处理
		return nil
	}
	if task == nil || task.dbData == nil || task.dbData.Done {
		return nil
	}
	if _, ok := s.unFinTasksCache[task.dbData.TaskID]; !ok {
		s.unFinTasksCache[task.dbData.TaskID] = task
	} else {
		return nil
	}
	return nil
}
