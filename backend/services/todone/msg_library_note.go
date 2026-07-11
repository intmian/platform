package todone

import (
	"time"

	"github.com/intmian/platform/backend/services/todone/protocol"
	"github.com/intmian/platform/backend/share"
)

const (
	CmdGetLibraryNotes   share.Cmd = "getLibraryNotes"
	CmdCreateLibraryNote share.Cmd = "createLibraryNote"
	CmdChangeLibraryNote share.Cmd = "changeLibraryNote"
	CmdDelLibraryNote    share.Cmd = "delLibraryNote"
)

type LibraryTaskScope struct {
	DirID      uint32
	GroupID    uint32
	SubGroupID uint32
	TaskID     uint32
}

type GetLibraryNotesReq struct {
	UserID string
	LibraryTaskScope
}

type GetLibraryNotesRet struct {
	Notes []protocol.PLibraryNote
}

type CreateLibraryNoteReq struct {
	UserID string
	LibraryTaskScope
	RoundID         string
	EventTime       time.Time
	Content         string
	ClientRequestID string
}

type CreateLibraryNoteRet struct {
	Note protocol.PLibraryNote
}

type ChangeLibraryNoteReq struct {
	UserID string
	LibraryTaskScope
	NoteID    string
	EventTime time.Time
	Content   string
	Revision  uint32
}

type ChangeLibraryNoteRet struct {
	Note protocol.PLibraryNote
}

type DelLibraryNoteReq struct {
	UserID string
	LibraryTaskScope
	NoteID   string
	Revision uint32
}

type DelLibraryNoteRet struct{}
