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

const MaxLibraryScoreDetailBytes = 64 * 1024

func validateLibraryScoreAdjustment(value int8) error {
	if value < -1 || value > 1 {
		return errors.New("library score adjustment invalid")
	}
	return nil
}

func validateLibraryScoreDimension(input *LibraryScoreDimensionInput) error {
	if input == nil {
		return nil
	}
	if input.Value < 1 || input.Value > 5 {
		return errors.New("library score dimension value invalid")
	}
	return validateLibraryScoreAdjustment(input.Adjustment)
}

func validateLibraryScoreDetailInput(input LibraryScoreDetailInput) (LibraryScoreDetailInput, error) {
	input.Mode = strings.TrimSpace(input.Mode)
	if input.Mode != "simple" && input.Mode != "complex" {
		return input, errors.New("library score mode invalid")
	}
	input.Comment = strings.TrimSpace(input.Comment)
	if !utf8.ValidString(input.Comment) {
		return input, errors.New("library score comment invalid utf8")
	}
	for _, dimension := range []*LibraryScoreDimensionInput{input.ObjScore, input.SubScore, input.InnovateScore} {
		if err := validateLibraryScoreDimension(dimension); err != nil {
			return input, err
		}
		if dimension != nil {
			dimension.Comment = strings.TrimSpace(dimension.Comment)
			if !utf8.ValidString(dimension.Comment) {
				return input, errors.New("library score dimension comment invalid utf8")
			}
		}
	}
	if input.Mode == "simple" {
		input.ObjScore = nil
		input.SubScore = nil
		input.InnovateScore = nil
	}
	totalBytes := len([]byte(input.Comment))
	for _, dimension := range []*LibraryScoreDimensionInput{input.ObjScore, input.SubScore, input.InnovateScore} {
		if dimension != nil {
			totalBytes += len([]byte(dimension.Comment))
		}
	}
	if totalBytes > MaxLibraryScoreDetailBytes {
		return input, errors.New("library score detail too large")
	}
	return input, nil
}

func dimensionInputToDB(input *LibraryScoreDimensionInput) (*uint8, int8, string) {
	if input == nil {
		return nil, 0, ""
	}
	value := input.Value
	return &value, input.Adjustment, input.Comment
}

func scoreDetailInputToDB(userID string, taskID uint32, roundID, scoreID string, input LibraryScoreDetailInput) db.LibraryScoreDetailDB {
	objValue, objAdjustment, objComment := dimensionInputToDB(input.ObjScore)
	subValue, subAdjustment, subComment := dimensionInputToDB(input.SubScore)
	innovateValue, innovateAdjustment, innovateComment := dimensionInputToDB(input.InnovateScore)
	return db.LibraryScoreDetailDB{
		ID: scoreID, UserID: userID, TaskID: taskID, RoundID: roundID, Mode: input.Mode, Comment: input.Comment,
		ObjValue: objValue, ObjAdjustment: objAdjustment, ObjComment: objComment,
		SubValue: subValue, SubAdjustment: subAdjustment, SubComment: subComment,
		InnovateValue: innovateValue, InnovateAdjustment: innovateAdjustment, InnovateComment: innovateComment,
	}
}

func dimensionDBToProtocol(value *uint8, adjustment int8, comment string) *protocol.PLibraryScoreDimension {
	if value == nil {
		return nil
	}
	return &protocol.PLibraryScoreDimension{Value: *value, Adjustment: adjustment, Comment: comment}
}

func libraryScoreDetailToProtocol(detail db.LibraryScoreDetailDB) protocol.PLibraryScoreDetail {
	return protocol.PLibraryScoreDetail{
		ID: detail.ID, TaskID: detail.TaskID, RoundID: detail.RoundID, Mode: detail.Mode, Comment: detail.Comment,
		ObjScore:      dimensionDBToProtocol(detail.ObjValue, detail.ObjAdjustment, detail.ObjComment),
		SubScore:      dimensionDBToProtocol(detail.SubValue, detail.SubAdjustment, detail.SubComment),
		InnovateScore: dimensionDBToProtocol(detail.InnovateValue, detail.InnovateAdjustment, detail.InnovateComment),
		Revision:      detail.Revision, CreatedAt: detail.CreatedAt, UpdatedAt: detail.UpdatedAt,
	}
}

func validateScoreExistsInTask(validated *validatedLibraryTask, scoreID string) (string, error) {
	taskData, err := validated.Task.GetTaskData()
	if err != nil || taskData == nil {
		return "", errors.New("task not exist")
	}
	roundID, exists, err := findLibraryScoreRoundID(taskData.Note, scoreID)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", errors.New("library score not exist")
	}
	return roundID, nil
}

func (s *Service) OnGetLibraryScoreDetail(_ backendshare.Valid, req GetLibraryScoreDetailReq) (ret GetLibraryScoreDetailRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		validated, validateErr := validateLibraryTask(user, req.LibraryTaskScope)
		if validateErr != nil {
			err = validateErr
			return
		}
		roundID, scoreErr := validateScoreExistsInTask(validated, req.ScoreID)
		if scoreErr != nil {
			err = scoreErr
			return
		}
		detail, getErr := db.GetLibraryScoreDetail(db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryScoreDetail), req.UserID, validated.Task.GetID(), req.ScoreID)
		if getErr != nil {
			err = getErr
			return
		}
		if detail.RoundID != roundID {
			err = errors.New("library score round mismatch")
			return
		}
		ret.Detail = libraryScoreDetailToProtocol(*detail)
	}, func() { err = errors.New("user not exist") })
	return
}

func (s *Service) OnCreateLibraryScoreDetail(_ backendshare.Valid, req CreateLibraryScoreDetailReq) (ret CreateLibraryScoreDetailRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		validated, validateErr := validateLibraryTask(user, req.LibraryTaskScope)
		if validateErr != nil {
			err = validateErr
			return
		}
		if _, parseErr := uuid.Parse(req.ScoreID); parseErr != nil {
			err = errors.New("library score id invalid")
			return
		}
		if _, parseErr := uuid.Parse(req.ClientRequestID); parseErr != nil {
			err = errors.New("client request id invalid")
			return
		}
		if !containsLibraryRoundID(validated.RoundIDs, req.RoundID) {
			err = errors.New("library round not exist")
			return
		}
		input, inputErr := validateLibraryScoreDetailInput(req.Detail)
		if inputErr != nil {
			err = inputErr
			return
		}
		detail := scoreDetailInputToDB(req.UserID, validated.Task.GetID(), req.RoundID, req.ScoreID, input)
		detail.Revision = 1
		requestID := req.ClientRequestID
		detail.ClientRequestID = &requestID
		created, createErr := db.CreateLibraryScoreDetail(db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryScoreDetail), &detail)
		if createErr != nil {
			err = createErr
			return
		}
		ret.Detail = libraryScoreDetailToProtocol(*created)
	}, func() { err = errors.New("user not exist") })
	return
}

func (s *Service) OnChangeLibraryScoreDetail(_ backendshare.Valid, req ChangeLibraryScoreDetailReq) (ret ChangeLibraryScoreDetailRet, err error) {
	s.userMgr.SafeUseUserLogic(req.UserID, func(user *logic.UserLogic) {
		validated, validateErr := validateLibraryTask(user, req.LibraryTaskScope)
		if validateErr != nil {
			err = validateErr
			return
		}
		roundID, scoreErr := validateScoreExistsInTask(validated, req.ScoreID)
		if scoreErr != nil {
			err = scoreErr
			return
		}
		input, inputErr := validateLibraryScoreDetailInput(req.Detail)
		if inputErr != nil {
			err = inputErr
			return
		}
		detail := scoreDetailInputToDB(req.UserID, validated.Task.GetID(), roundID, req.ScoreID, input)
		updated, updateErr := db.ChangeLibraryScoreDetail(db.GTodoneDBMgr.GetConnect(db.ConnectTypeLibraryScoreDetail), &detail, req.Revision)
		if updateErr != nil {
			err = updateErr
			return
		}
		ret.Detail = libraryScoreDetailToProtocol(*updated)
	}, func() { err = errors.New("user not exist") })
	return
}
