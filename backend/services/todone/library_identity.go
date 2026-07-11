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
