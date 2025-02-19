package todone

import (
	"errors"
	"github.com/intmian/platform/backend/services/todone/logic"
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

func (s *Service) OnMoveDir(valid backendshare.Valid, req MoveDirReq) (ret MoveDirRet, err error) {
	user := s.userMgr.GetUserLogic(req.UserID)
	if user == nil {
		err = errors.New("user not exist")
		return
	}
	user.Lock()
	defer user.Unlock()

	err = user.MoveDir(req.DirID, req.TrgDir, req.AfterID, req.AfterIsDir)
	if err != nil {
		err = errors.Join(err, errors.New("move dir failed"))
	}
	return
}

func (s *Service) OnMoveGroup(valid backendshare.Valid, req MoveGroupReq) (ret MoveGroupRet, err error) {
	user := s.userMgr.GetUserLogic(req.UserID)
	if user == nil {
		err = errors.New("user not exist")
		return
	}
	user.Lock()
	defer user.Unlock()

	err = user.MoveGroup(req.ParentDirID, req.GroupID, req.TrgDir, req.AfterID, req.AfterIsDir)
	if err != nil {
		err = errors.Join(err, errors.New("move group failed"))
	}
	return
}

func (s *Service) OnDelGroup(valid backendshare.Valid, req DelGroupReq) (ret DelGroupRet, err error) {
	user := s.userMgr.GetUserLogic(req.UserID)
	if user == nil {
		err = errors.New("user not exist")
		return
	}
	user.Lock()
	defer user.Unlock()

	err = user.DelGroup(req.GroupID)
	if err != nil {
		err = errors.New("del group failed")
		return
	}
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
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		ID, err2, index := user.CreateGroup(req.ParentDir, req.Title, req.Note, req.AfterID, req.AfterIsDir)
		if err2 != nil {
			err = errors.Join(err, err2)
			return
		}
		ret.GroupID = ID
		ret.Index = index
	}, func() {
		err = errors.New("user not exist")
	})
	return
}

func (s *Service) OnChangeGroup(valid backendshare.Valid, req ChangeGroupReq) (ret ChangeGroupRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		group := user.GetGroupLogic(req.ParentDirID, req.Group.ID)
		err2 := group.ChangeData(req.Title, req.Note, 0)
		if err2 != nil {
			err = errors.Join(err, err2)
			return
		}
	}, func() {
		err = errors.New("user not exist")
	})
	return
}

func (s *Service) OnGetSubGroup(valid backendshare.Valid, req GetSubGroupReq) (ret GetSubGroupRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		group := user.GetGroupLogic(req.ParentDirID, req.GroupID)
		if group == nil {
			err = errors.New("group not exist")
			return
		}
		subGroups, err2 := group.GetSubGroups()
		if err2 != nil {
			err = errors.Join(err, err2)
			return
		}
		for _, subGroup := range subGroups {
			ret.SubGroups = append(ret.SubGroups, subGroup.ToProtocol())
		}
	}, func() {
		err = errors.New("user not exist")
	})
	return
}

func (s *Service) OnGetTaskByPage(valid backendshare.Valid, req GetTaskByPageReq) (ret GetTaskByPageRet, err error) {
	f := func(user *logic.UserLogic) {
		group := user.GetGroupLogic(req.ParentDirID, req.GroupID)
		if group == nil {
			err = errors.New("group not exist")
			return
		}
		subGroup := group.GetSubGroupLogic(req.SubGroupID)
		if subGroup == nil {
			err = errors.New("sub group not exist")
			return
		}
		tasks, err2 := subGroup.GetTasksByPage(req.Page, req.PageNum, req.ContainDone)
		if err2 != nil {
			err = errors.Join(err, err2)
			return
		}
		for _, task := range tasks {
			ret.Tasks = append(ret.Tasks, task.ToProtocol())
		}
	}
	s.userMgr.SafeUseUserLogic(req.UserID, f, func() {
		err = errors.New("user not exist")
	})
	return
}

func (s *Service) OnGetTask(valid backendshare.Valid, req GetTaskReq) (ret GetTaskRet, err error) {
	f := func(user *logic.UserLogic) {
		task := user.GetTaskLogic(req.TaskID)
		if task == nil {
			err = errors.New("task not exist")
			return
		}
		ret.Task = task.ToProtocol()
	}
	s.userMgr.SafeUseUserLogic(req.UserID, f, func() {
		err = errors.New("user not exist")
	})
	return
}

func (s *Service) OnChangeTask(valid backendshare.Valid, req ChangeTaskReq) (ret ChangeTaskRet, err error) {
	f := func(user *logic.UserLogic) {
		task := user.GetTaskLogic(req.Data.ID)
		if task == nil {
			err = errors.New("task not exist")
			return
		}
		err2 := task.ChangeFromProtocol(req.Data)
		if err2 != nil {
			err = errors.Join(err, err2)
			return
		}
	}
	s.userMgr.SafeUseUserLogic(req.UserID, f, func() {
		err = errors.New("user not exist")
	})
	return
}

func (s *Service) OnCreateTask(valid backendshare.Valid, req CreateTaskReq) (ret CreateTaskRet, err error) {
	f := func(user *logic.UserLogic) {
		if req.ParentTask == 0 {
			group := user.GetSubGroupLogic(req.DirID, req.GroupID, req.SubGroupID)
			if group == nil {
				err = errors.New("group not exist")
			}
			task, err2 := group.CreateTask(req.UserID, req.Title, req.Note)
			if err2 != nil {
				err = errors.Join(errors.New("create task failed"), err2)
				return
			}
			ret.TaskID = task.GetID()
		} else {
			task := user.GetTaskLogic(req.ParentTask)
			if task == nil {
				err = errors.New("task not exist")
				return
			}
			subTask, err2 := task.CreateSubTask(req.UserID, req.Title, req.Note)
			if err2 != nil {
				err = errors.Join(errors.New("create sub task failed"), err2)
				return
			}
			ret.TaskID = subTask.GetID()
		}
	}
	s.userMgr.SafeUseUserLogic(req.UserID, f, func() {
		err = errors.New("user not exist")
	})
	return
}

func (s *Service) OnDelTask(valid backendshare.Valid, req DelTaskReq) (ret DelTaskRet, err error) {
	f := func(user *logic.UserLogic) {
		task := user.GetTaskLogic(req.TaskID)
		if task == nil {
			err = errors.New("task not exist")
			return
		}
		err2 := task.Delete()
		if err2 != nil {
			err = errors.Join(err, err2)
			return
		}
	}
	s.userMgr.SafeUseUserLogic(req.UserID, f, func() {
		err = errors.New("user not exist")
	})
	return
}
