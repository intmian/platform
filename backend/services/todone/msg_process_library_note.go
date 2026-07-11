package todone

import (
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/logic"
	"github.com/intmian/platform/backend/services/todone/protocol"
	backendshare "github.com/intmian/platform/backend/share"
)

const MaxLibraryNoteContentBytes = 64 * 1024

type validatedLibraryTask struct {
	Task     *logic.TaskLogic
	RoundIDs []string
}

func validateLibraryTask(user *logic.UserLogic, scope LibraryTaskScope) (*validatedLibraryTask, error) {
	group := user.GetGroupLogic(scope.DirID, scope.GroupID)
	if group == nil {
		return nil, errors.New("group not exist")
	}
	groupData, err := group.GetGroupData()
	if err != nil || groupData == nil {
		return nil, errors.New("group not exist")
	}
	if groupData.Type != db.GroupTypeLibrary {
		return nil, errors.New("group is not library")
	}
	subGroup := group.GetSubGroupLogic(scope.SubGroupID)
	if subGroup == nil {
		return nil, errors.New("sub group not exist")
	}
	task := subGroup.GetTaskLogic(scope.TaskID)
	if task == nil {
		return nil, errors.New("task not exist")
	}
	taskData, err := task.GetTaskData()
	if err != nil || taskData == nil || taskData.Deleted {
		return nil, errors.New("task not exist")
	}
	roundIDs, err := parseLibraryRoundIDs(taskData.Note)
	if err != nil {
		return nil, err
	}
	return &validatedLibraryTask{Task: task, RoundIDs: roundIDs}, nil
}

func validateLibraryNoteContent(content string) (string, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "", errors.New("library note content empty")
	}
	if !utf8.ValidString(content) {
		return "", errors.New("library note content invalid utf8")
	}
	if len([]byte(content)) > MaxLibraryNoteContentBytes {
		return "", errors.New("library note content too large")
	}
	return content, nil
}

func libraryNoteToProtocol(note db.LibraryNoteDB) protocol.PLibraryNote {
	return protocol.PLibraryNote{
		ID: note.ID, TaskID: note.TaskID, RoundID: note.RoundID, EventTime: note.EventTime,
		Content: note.Content, Revision: note.Revision, CreatedAt: note.CreatedAt, UpdatedAt: note.UpdatedAt,
	}
}

func (s *Service) OnGetLibraryNotes(_ backendshare.Valid, req GetLibraryNotesReq) (ret GetLibraryNotesRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		validated, validateErr := validateLibraryTask(user, req.LibraryTaskScope)
		if validateErr != nil {
			err = validateErr
			return
		}
		conn := db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryNote)
		notes, getErr := db.GetLibraryNotes(conn, req.UserID, validated.Task.GetID(), validated.RoundIDs)
		if getErr != nil {
			err = getErr
			return
		}
		ret.Notes = make([]protocol.PLibraryNote, 0, len(notes))
		for _, note := range notes {
			ret.Notes = append(ret.Notes, libraryNoteToProtocol(note))
		}
	}, func() { err = errors.New("user not exist") })
	return
}

func (s *Service) OnCreateLibraryNote(_ backendshare.Valid, req CreateLibraryNoteReq) (ret CreateLibraryNoteRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		validated, validateErr := validateLibraryTask(user, req.LibraryTaskScope)
		if validateErr != nil {
			err = validateErr
			return
		}
		if !containsLibraryRoundID(validated.RoundIDs, req.RoundID) {
			err = errors.New("library round not exist")
			return
		}
		content, contentErr := validateLibraryNoteContent(req.Content)
		if contentErr != nil {
			err = contentErr
			return
		}
		if req.ClientRequestID == "" {
			err = errors.New("client request id empty")
			return
		}
		if req.EventTime.IsZero() {
			err = errors.New("library note event time empty")
			return
		}
		requestID := req.ClientRequestID
		note := &db.LibraryNoteDB{
			ID: uuid.NewString(), UserID: req.UserID, TaskID: validated.Task.GetID(), RoundID: req.RoundID,
			EventTime: req.EventTime.UTC(), Content: content, Revision: 1, ClientRequestID: &requestID,
		}
		created, createErr := db.CreateLibraryNote(db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryNote), note)
		if createErr != nil {
			err = createErr
			return
		}
		ret.Note = libraryNoteToProtocol(*created)
	}, func() { err = errors.New("user not exist") })
	return
}

func (s *Service) OnChangeLibraryNote(_ backendshare.Valid, req ChangeLibraryNoteReq) (ret ChangeLibraryNoteRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		validated, validateErr := validateLibraryTask(user, req.LibraryTaskScope)
		if validateErr != nil {
			err = validateErr
			return
		}
		content, contentErr := validateLibraryNoteContent(req.Content)
		if contentErr != nil {
			err = contentErr
			return
		}
		if req.EventTime.IsZero() {
			err = errors.New("library note event time empty")
			return
		}
		existing, getErr := db.GetLibraryNote(db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryNote), req.UserID, validated.Task.GetID(), req.NoteID)
		if getErr != nil {
			err = getErr
			return
		}
		if !containsLibraryRoundID(validated.RoundIDs, existing.RoundID) {
			err = errors.New("library round not exist")
			return
		}
		updated, updateErr := db.ChangeLibraryNote(
			db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryNote), req.UserID, validated.Task.GetID(),
			req.NoteID, req.Revision, content, req.EventTime.UTC(),
		)
		if updateErr != nil {
			err = updateErr
			return
		}
		ret.Note = libraryNoteToProtocol(*updated)
	}, func() { err = errors.New("user not exist") })
	return
}

func (s *Service) OnDelLibraryNote(_ backendshare.Valid, req DelLibraryNoteReq) (ret DelLibraryNoteRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		validated, validateErr := validateLibraryTask(user, req.LibraryTaskScope)
		if validateErr != nil {
			err = validateErr
			return
		}
		existing, getErr := db.GetLibraryNote(db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryNote), req.UserID, validated.Task.GetID(), req.NoteID)
		if getErr != nil {
			err = getErr
			return
		}
		if !containsLibraryRoundID(validated.RoundIDs, existing.RoundID) {
			err = errors.New("library round not exist")
			return
		}
		err = db.DeleteLibraryNote(
			db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryNote), req.UserID, validated.Task.GetID(), req.NoteID, req.Revision,
		)
	}, func() { err = errors.New("user not exist") })
	return
}
