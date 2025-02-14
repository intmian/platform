package todone

import (
	"errors"
	backendshare "github.com/intmian/platform/backend/share"
)

func (s *Service) OnGetDirTree(valid backendshare.Valid, req GetDirTreeReq) (ret GetDirTreeRet, err error) {
	user := s.userMgr.GetUserLogic(req.UserID)
	if user == nil {
		err = errors.New("user not exist")
		return
	}
	user.Lock()
	defer user.Unlock()
	tree, err := user.GetDirTree()
	if err != nil {
		return
	}
	ret.DirTree = *tree
	return
}

func (s *Service) OnCreateDir(valid backendshare.Valid, req CreateDirReq) (ret CreateDirRet, err error) {
	user := s.userMgr.GetUserLogic(req.UserID)
	if user == nil {
		err = errors.New("user not exist")
		return
	}
	user.Lock()
	defer user.Unlock()
	ID, err := user.CreateDir(req.ParentDirID, req.Title, req.Note)
	if err != nil {
		err = errors.New("create dir failed")
		return
	}
	ret.DirID = ID
	if req.AfterID != 0 {
		err = user.MoveDir(ID, req.ParentDirID, req.AfterID, req.AfterIsDir)
		if err != nil {
			err = errors.New("move dir failed")
			return
		}
	}
	return
}

func (s *Service) OnChangeDir(valid backendshare.Valid, req ChangeDirReq) (ret ChangeDirRet, err error) {
	user := s.userMgr.GetUserLogic(req.UserID)
	if user == nil {
		err = errors.New("user not exist")
		return
	}
	user.Lock()
	defer user.Unlock()
	dir := user.GetDirLogic(req.DirID)
	if dir == nil {
		err = errors.New("dir not exist")
		return
	}
	err = dir.ChangeData(req.Title, req.Note, 0)
	if err != nil {
		err = errors.New("change dir failed")
		return
	}
	return
}

func (s *Service) OnDelDir(valid backendshare.Valid, req DelDirReq) (ret DelDirRet, err error) {
	user := s.userMgr.GetUserLogic(req.UserID)
	if user == nil {
		err = errors.New("user not exist")
		return
	}
	user.Lock()
	defer user.Unlock()
	err = user.DelDir(req.DirID)
	if err != nil {
		err = errors.New("del dir failed")
		return
	}
	return
}

func (s *Service) OnCreateGroup(valid backendshare.Valid, req CreateGroupReq) (ret CreateGroupRet, err error) {
	// TODO
}

func (s *Service) OnChangeGroup(valid backendshare.Valid, req ChangeGroupReq) (ret ChangeGroupRet, err error) {
	// TODO
}

func (s *Service) OnGetSubGroup(valid backendshare.Valid, req GetSubGroupReq) (ret GetSubGroupRet, err error) {
	// TODO
}

func (s *Service) OnGetTaskByPage(valid backendshare.Valid, req GetTaskByPageReq) (ret GetTaskByPageRet, err error) {
	// TODO
}

func (s *Service) OnGetTask(valid backendshare.Valid, req GetTaskReq) (ret GetTaskRet, err error) {
	// TODO
}

func (s *Service) OnChangeTask(valid backendshare.Valid, req ChangeTaskReq) (ret ChangeTaskRet, err error) {
	// TODO
}

func (s *Service) OnCreateTask(valid backendshare.Valid, req CreateTaskReq) (ret CreateTaskRet, err error) {
	// TODO
}

func (s *Service) OnDelTask(valid backendshare.Valid, req DelTaskReq) (ret DelTaskRet, err error) {
	// TODO
}
