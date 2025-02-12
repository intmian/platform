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
	err = user.ChangeDir(req.DirID, req.Title, req.Note)
	if err != nil {
		err = errors.New("change dir failed")
		return
	}
	return
}

func (s *Service) OnDelGroup(valid backendshare.Valid, req DelGroupReq) (ret DelGroupRet, err error) {
	// TODO
	return
}
