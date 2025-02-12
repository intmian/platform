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
