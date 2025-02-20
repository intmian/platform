package logic

import (
	"errors"
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
	"sync"
)

// dirTreeNode 目录树节点，因为是全量展开所以直接全部加载到内存，。
type dirTreeNode struct {
	dir    *DirLogic
	childs []*dirTreeNode
	groups []*GroupLogic
}

type UserLogic struct {
	userID string

	// 目前没有用户数据，所以这里没有数据，仅做锁
	l sync.Mutex

	dirTree *dirTreeNode // 目录树，所有的目录关系仅在此处维护，不放在logic中
	dirMap  map[uint32]*dirTreeNode
}

func NewUserLogic(userID string) *UserLogic {
	return &UserLogic{
		userID: userID,
	}
}

func (u *UserLogic) Lock() {
	u.l.Lock()
}

func (u *UserLogic) Unlock() {
	u.l.Unlock()
}

func (u *UserLogic) loadDirTree() error {
	if u.dirTree != nil {
		return nil
	}
	err := u.buildDirTree()
	if err != nil {
		return errors.Join(err, errors.New("build dir tree failed"))
	}
	return nil
}

func (u *UserLogic) GetDirLogic(dirID uint32) *DirLogic {
	if u.dirTree == nil {
		err := u.loadDirTree()
		if err != nil {
			return nil
		}
	}
	return u.dirMap[dirID].dir
}

func (u *UserLogic) buildDirTree() error {
	// 加载所有group和dir
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeGroup)
	if connect == nil {
		return errors.New("get connect failed")
	}
	groups, err := db.GetGroupsByUser(connect, u.userID)
	if err != nil {
		return errors.Join(err, errors.New("load groups failed"))
	}
	connect = db.GTodoneDBMgr.GetConnect(db.ConnectTypeDir)
	if connect == nil {
		return errors.New("get connect failed")
	}
	dirs, err := db.GetDirsByUserID(connect, u.userID)
	if err != nil {
		return errors.Join(err, errors.New("load dirs failed"))
	}

	// 构建树
	dirMap := make(map[uint32]*dirTreeNode)
	for _, dir := range dirs {
		dirMap[dir.ID] = &dirTreeNode{
			dir: NewDirLogic(dir.ID),
		}
	}
	for _, dir := range dirs {
		if dirNode, ok := dirMap[dir.ParentID]; ok {
			dirNode.childs = append(dirNode.childs, dirMap[dir.ID])
		}
	}
	for _, group := range groups {
		dirID := group.ParentDir
		if dirNode, ok := dirMap[dirID]; ok {
			dirNode.groups = append(dirNode.groups, NewGroupLogic(group.ID))
		}
	}
	u.dirMap = dirMap

	// 找到根节点
	for _, dir := range dirs {
		if dir.ParentID == 0 {
			u.dirTree = dirMap[dir.ID]
			break
		}
	}

	// 如果没有根节点，需要创建一个
	if u.dirTree == nil {
		connect = db.GTodoneDBMgr.GetConnect(db.ConnectTypeDir)
		if connect == nil {
			return errors.New("get connect failed when create root dir")
		}
		dirID, err := db.CreateDir(connect, u.userID, 0, "root", "default root dir")
		if err != nil {
			return err
		}
		logic := NewDirLogic(dirID)
		logic.OnBindOutData(&db.DirDB{
			ID: dirID,
		})
	}
	return nil
}

func (u *UserLogic) GetDirTree() (*protocol.PDirTree, error) {
	if u.dirTree == nil {
		err := u.loadDirTree()
		if err != nil {
			return nil, errors.Join(err, errors.New("load dir tree failed"))
		}
	}

	var buildTree func(node *dirTreeNode) *protocol.PDirTree
	buildTree = func(node *dirTreeNode) *protocol.PDirTree {
		ret := &protocol.PDirTree{
			RootDir: node.dir.ToProtocol(),
		}
		for _, child := range node.childs {
			ret.ChildrenDir = append(ret.ChildrenDir, *buildTree(child))
		}
		for _, group := range node.groups {
			ret.ChildrenGrp = append(ret.ChildrenGrp, group.ToProtocol())
		}
		return ret
	}

	return buildTree(u.dirTree), nil
}

func (u *UserLogic) CreateDir(parentDirID uint32, title, note string) (uint32, error) {
	// 校验父节点是否存在
	if parentDirID != 0 {
		return 0, errors.New("parent dir not exist")
	} else {
		if _, ok := u.dirMap[parentDirID]; !ok {
			return 0, errors.New("parent dir not exist")
		}
	}

	// 更新数据库
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeDir)
	if connect == nil {
		return 0, errors.New("get connect failed")
	}
	dirID, err := db.CreateDir(connect, u.userID, parentDirID, title, note)
	if err != nil {
		return 0, errors.Join(err, errors.New("create dir failed"))
	}

	// 更新内存
	dirNode := &dirTreeNode{
		dir: NewDirLogic(dirID),
	}
	u.dirMap[dirID] = dirNode
	if parentDir, ok := u.dirMap[parentDirID]; ok {
		parentDir.childs = append(parentDir.childs, dirNode)
	}

	// 找到一个合适的index，最大的index+1
	maxIndex := float32(0)
	parentDir, ok := u.dirMap[parentDirID]
	if ok {
		for _, child := range parentDir.childs {
			if child.dir.dbData.Index > maxIndex {
				maxIndex = child.dir.dbData.Index
			}
		}
		for _, group := range parentDir.groups {
			if group.dbData.Index > maxIndex {
				maxIndex = group.dbData.Index
			}
		}
	} else {
		maxIndex = 1
	}
	dirNode.dir.dbData.Index = maxIndex + 1
	err = dirNode.dir.Save()
	if err != nil {
		return 0, errors.Join(err, errors.New("save dir failed"))
	}

	return dirID, nil
}

func (u *UserLogic) MoveDir(dirID, trgDir uint32, afterID uint32) error {
	// 校验目标节点是否存在
	trg, ok := u.dirMap[trgDir]
	if !ok {
		return errors.New("target dir not exist")
	}
	src, ok := u.dirMap[dirID]
	if !ok {
		return errors.New("src dir not exist")
	}

	// 更新内存
	oldParentID := src.dir.dbData.ParentID
	if oldParentID == 0 {
		return errors.New("can't move root dir")
	}
	oldParent, ok := u.dirMap[oldParentID]
	if !ok {
		return errors.New("old parent dir not exist")
	}
	// 从原来的父节点中删除
	for i, child := range oldParent.childs {
		if child == src {
			oldParent.childs = append(oldParent.childs[:i], oldParent.childs[i+1:]...)
			break
		}
	}
	// 放到新的父节点中
	trg.childs = append(trg.childs, src)
	if afterID != 0 {
		// 根据afterID找到位置，放在其后，如果后面还有，Index取中间值，否则+1
		leftIndex := float32(0)
		rightIndex := float32(0)
		for _, child := range trg.childs {
			if child.dir.dbData.ID == afterID {
				leftIndex = child.dir.dbData.Index
				break
			}
		}

		// 遍历所有child，找到比leftIndex大的最小值
		for _, child := range trg.childs {
			if child.dir.dbData.Index > leftIndex {
				if rightIndex == 0 || child.dir.dbData.Index < rightIndex {
					rightIndex = child.dir.dbData.Index
				}
			}
		}

		var newIndex float32
		if rightIndex == 0 {
			newIndex = leftIndex + 1
		} else {
			newIndex = (leftIndex + rightIndex) / 2
		}
		src.dir.dbData.Index = newIndex
	}

	// 更新数据库
	err := src.dir.Save()
	if err != nil {
		return errors.Join(err, errors.New("save dir failed"))
	}

	return nil
}

func (u *UserLogic) MoveGroup(parentDirID, groupID, trgDir uint32, afterID uint32) error {
	// 校验目标节点是否存在
	trg, ok := u.dirMap[trgDir]
	if !ok {
		return errors.New("target dir not exist")
	}
	parent, ok := u.dirMap[parentDirID]
	if !ok {
		return errors.New("parent dir not exist")
	}
	var group *GroupLogic
	for _, grp := range parent.groups {
		if grp.dbData.ID == groupID {
			group = grp
			break
		}
	}
	if group == nil {
		return errors.New("group not exist")
	}

	// 更新内存
	oldParentID := group.dbData.ParentDir
	if oldParentID == 0 {
		return errors.New("can't move root group")
	}
	oldParent, ok := u.dirMap[oldParentID]
	if !ok {
		return errors.New("old parent dir not exist")
	}
	// 从原来的父节点中删除
	for i, grp := range oldParent.groups {
		if grp == group {
			oldParent.groups = append(oldParent.groups[:i], oldParent.groups[i+1:]...)
			break
		}
	}
	// 放到新的父节点中
	trg.groups = append(trg.groups, group)
	if afterID != 0 {
		// 根据afterID找到位置，放在其后，如果后面还有，Index取中间值，否则+1
		leftIndex := float32(0)
		rightIndex := float32(0)
		for _, grp := range trg.groups {
			if grp.dbData.ID == afterID {
				leftIndex = grp.dbData.Index
				break
			}
		}
		// 遍历所有group，找到比leftIndex大的最小值
		for _, grp := range trg.groups {
			if grp.dbData.Index > leftIndex {
				if rightIndex == 0 || grp.dbData.Index < rightIndex {
					rightIndex = grp.dbData.Index
				}
			}
		}
		var newIndex float32
		if rightIndex == 0 {
			newIndex = leftIndex + 1
		} else {
			newIndex = (leftIndex + rightIndex) / 2
		}
		group.dbData.Index = newIndex
	}

	// 更新数据库
	err := group.Save()
	if err != nil {
		return errors.Join(err, errors.New("save group failed"))
	}

	return nil
}

func (u *UserLogic) DelDir(dirID uint32) error {
	// 判断是否存在
	dir, ok := u.dirMap[dirID]
	if !ok {
		return errors.New("dir not exist")
	}
	// 判断是否有子节点
	if len(dir.childs) != 0 || len(dir.groups) != 0 {
		return errors.New("dir has child")
	}

	// 更新内存
	parentID := dir.dir.dbData.ParentID
	if parentID == 0 {
		return errors.New("can't del root dir")
	}
	parent, ok := u.dirMap[parentID]
	if !ok {
		return errors.New("parent dir not exist")
	}
	for i, child := range parent.childs {
		if child == dir {
			parent.childs = append(parent.childs[:i], parent.childs[i+1:]...)
			break
		}
	}
	delete(u.dirMap, dirID)

	// 更新数据库
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeDir)
	if connect == nil {
		return errors.New("get connect failed")
	}
	err := dir.dir.Delete()
	if err != nil {
		return errors.Join(err, errors.New("delete dir failed"))
	}

	return nil
}

func (u *UserLogic) DelGroup(groupID uint32) error {
	// 判断是否存在
	var group *GroupLogic
	for _, grp := range u.dirTree.groups {
		if grp.dbData.ID == groupID {
			group = grp
			break
		}
	}
	if group == nil {
		return errors.New("group not exist")
	}

	// 更新内存
	parentID := group.dbData.ParentDir
	if parentID == 0 {
		return errors.New("can't del root group")
	}
	parent, ok := u.dirMap[parentID]
	if !ok {
		return errors.New("parent dir not exist")
	}
	for i, grp := range parent.groups {
		if grp == group {
			parent.groups = append(parent.groups[:i], parent.groups[i+1:]...)
			break
		}
	}

	// 更新数据库
	err := group.Delete()
	if err != nil {
		return errors.Join(err, errors.New("delete group failed"))
	}

	return nil
}

func (u *UserLogic) CreateGroup(parentDirID uint32, title, note string, afterID uint32) (uint32, error, float32) {
	// 校验父节点是否存在
	if parentDirID != 0 {
		return 0, errors.New("parent dir not exist"), 0
	} else {
		if _, ok := u.dirMap[parentDirID]; !ok {
			return 0, errors.New("parent dir not exist"), 0
		}
	}

	// 更新数据库
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeGroup)
	if connect == nil {
		return 0, errors.New("get connect failed"), 0
	}
	groupID, err := db.CreateGroup(connect, u.userID, title, note, parentDirID)
	if err != nil {
		return 0, errors.Join(err, errors.New("create group failed")), 0
	}

	// 更新内存
	group := NewGroupLogic(groupID)
	group.dbData.ParentDir = parentDirID
	if parentDir, ok := u.dirMap[parentDirID]; ok {
		parentDir.groups = append(parentDir.groups, group)
	}

	if afterID != 0 {
		// 根据afterID找到位置，放在其后，如果后面还有，Index取中间值，否则+1
		leftIndex := float32(0)
		rightIndex := float32(0)
		for _, grp := range u.dirTree.groups {
			if grp.dbData.ID == afterID {
				leftIndex = grp.dbData.Index
				break
			}
		}
		// 遍历所有group，找到比leftIndex大的最小值
		for _, grp := range u.dirTree.groups {
			if grp.dbData.Index > leftIndex {
				if rightIndex == 0 || grp.dbData.Index < rightIndex {
					rightIndex = grp.dbData.Index
				}
			}
		}
		var newIndex float32
		if rightIndex == 0 {
			newIndex = leftIndex + 1
		} else {
			newIndex = (leftIndex + rightIndex) / 2
		}
		group.dbData.Index = newIndex
	} else {
		// 找到一个合适的index，最大的index+1
		maxIndex := float32(0)
		parentDir, ok := u.dirMap[parentDirID]
		if ok {
			for _, child := range parentDir.childs {
				if child.dir.dbData.Index > maxIndex {
					maxIndex = child.dir.dbData.Index
				}
			}
			for _, group := range parentDir.groups {
				if group.dbData.Index > maxIndex {
					maxIndex = group.dbData.Index
				}
			}
		} else {
			maxIndex = 1
		}
		group.dbData.Index = maxIndex + 1
	}

	err = group.Save()
	if err != nil {
		return 0, errors.Join(err, errors.New("save group failed")), 0
	}

	return groupID, nil, group.dbData.Index
}

func (u *UserLogic) GetGroupLogic(parentDirID, groupID uint32) *GroupLogic {
	dir, ok := u.dirMap[parentDirID]
	if !ok {
		return nil
	}
	for _, group := range dir.groups {
		if group.dbData.ID == groupID {
			return group
		}
	}
	return nil
}

func (u *UserLogic) GetSubGroupLogic(parentDirID, groupID, subGroupID uint32) *SubGroupLogic {
	group := u.GetGroupLogic(parentDirID, groupID)
	if group == nil {
		return nil
	}
	return group.GetSubGroupLogic(subGroupID)
}

func (u *UserLogic) GetTaskLogic(taskID uint32) *TaskLogic {
	t := NewTaskLogic(taskID)
	return t
}
