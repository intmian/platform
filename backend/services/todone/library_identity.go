package todone

import (
	"encoding/json"
	"errors"

	"github.com/google/uuid"
)

type libraryExtraIdentity struct {
	Rounds []libraryRoundIdentity `json:"rounds"`
}

type libraryRoundIdentity struct {
	ID string `json:"id"`
}

type libraryExtraScoreIdentity struct {
	Rounds []libraryRoundScoreIdentity `json:"rounds"`
}

type libraryRoundScoreIdentity struct {
	ID   string                    `json:"id"`
	Logs []libraryLogScoreIdentity `json:"logs"`
}

type libraryLogScoreIdentity struct {
	ID   string `json:"id"`
	Type int    `json:"type"`
}

func parseLibraryRoundIDs(note string) ([]string, error) {
	var extra libraryExtraIdentity
	if err := json.Unmarshal([]byte(note), &extra); err != nil {
		return nil, errors.New("invalid library data")
	}
	if len(extra.Rounds) == 0 {
		return nil, errors.New("library rounds empty")
	}
	ids := make([]string, 0, len(extra.Rounds))
	seen := make(map[string]struct{}, len(extra.Rounds))
	for _, round := range extra.Rounds {
		if round.ID == "" {
			return nil, errors.New("library round id empty")
		}
		if _, err := uuid.Parse(round.ID); err != nil {
			return nil, errors.New("library round id invalid")
		}
		if _, ok := seen[round.ID]; ok {
			return nil, errors.New("library round id duplicated")
		}
		seen[round.ID] = struct{}{}
		ids = append(ids, round.ID)
	}
	return ids, nil
}

func containsLibraryRoundID(ids []string, roundID string) bool {
	for _, id := range ids {
		if id == roundID {
			return true
		}
	}
	return false
}

func findLibraryScoreRoundID(note string, scoreID string) (string, bool, error) {
	var extra libraryExtraScoreIdentity
	if err := json.Unmarshal([]byte(note), &extra); err != nil {
		return "", false, errors.New("invalid library data")
	}
	seen := make(map[string]struct{})
	foundRoundID := ""
	for _, round := range extra.Rounds {
		if _, err := uuid.Parse(round.ID); err != nil {
			return "", false, errors.New("library round id invalid")
		}
		for _, log := range round.Logs {
			if log.Type != 1 {
				continue
			}
			if _, err := uuid.Parse(log.ID); err != nil {
				return "", false, errors.New("library score id invalid")
			}
			if _, duplicate := seen[log.ID]; duplicate {
				return "", false, errors.New("library score id duplicated")
			}
			seen[log.ID] = struct{}{}
			if log.ID == scoreID {
				foundRoundID = round.ID
			}
		}
	}
	return foundRoundID, foundRoundID != "", nil
}
