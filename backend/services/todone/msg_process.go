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
	// TODO
	return
}

func (s *Service) OnChangeDir(valid backendshare.Valid, req ChangeDirReq) (ret ChangeDirRet, err error) {
	// TODO
	return
}

func (s *Service) OnDelGroup(valid backendshare.Valid, req DelGroupReq) (ret DelGroupRet, err error) {
	// TODO
	return
}
