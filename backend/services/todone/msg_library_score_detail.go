package todone

import (
	"github.com/intmian/platform/backend/services/todone/protocol"
	"github.com/intmian/platform/backend/share"
)

const (
	CmdGetLibraryScoreDetail    share.Cmd = "getLibraryScoreDetail"
	CmdCreateLibraryScoreDetail share.Cmd = "createLibraryScoreDetail"
	CmdChangeLibraryScoreDetail share.Cmd = "changeLibraryScoreDetail"
)

type GetLibraryScoreDetailReq struct {
	UserID string
	LibraryTaskScope
	ScoreID string
}

type GetLibraryScoreDetailRet struct {
	Detail protocol.PLibraryScoreDetail
}

type LibraryScoreDimensionInput struct {
	Value      uint8
	Adjustment int8
	Comment    string
}

type LibraryScoreDetailInput struct {
	Mode          string
	Comment       string
	ObjScore      *LibraryScoreDimensionInput
	SubScore      *LibraryScoreDimensionInput
	InnovateScore *LibraryScoreDimensionInput
}

type CreateLibraryScoreDetailReq struct {
	UserID string
	LibraryTaskScope
	ScoreID         string
	RoundID         string
	ClientRequestID string
	Detail          LibraryScoreDetailInput
}

type CreateLibraryScoreDetailRet struct {
	Detail protocol.PLibraryScoreDetail
}

type ChangeLibraryScoreDetailReq struct {
	UserID string
	LibraryTaskScope
	ScoreID  string
	Revision uint32
	Detail   LibraryScoreDetailInput
}

type ChangeLibraryScoreDetailRet struct {
	Detail protocol.PLibraryScoreDetail
}
