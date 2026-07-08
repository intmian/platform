package platform

import (
	"encoding/json"

	"github.com/intmian/platform/backend/share"
)

type aiAction string

const (
	aiActionLibraryReviewNotesDigest aiAction = "library.reviewNotesDigest"
)

type aiRunReq struct {
	Action  aiAction        `json:"action"`
	Payload json.RawMessage `json:"payload"`
}

type aiActionHandler struct {
	Permissions []share.Permission
	Run         func(json.RawMessage) (interface{}, error)
}

type libraryReviewNoteDigestPayload struct {
	Title     string                    `json:"title"`
	Category  string                    `json:"category"`
	Author    string                    `json:"author"`
	RoundName string                    `json:"roundName"`
	Notes     []libraryReviewDigestNote `json:"notes"`
}

type libraryReviewDigestNote struct {
	Time    string `json:"time"`
	Content string `json:"content"`
}

type libraryReviewDigestPoint struct {
	Point    string `json:"point"`
	Evidence string `json:"evidence,omitempty"`
}

type libraryReviewDigestResp struct {
	Positives []libraryReviewDigestPoint `json:"positives"`
	Negatives []libraryReviewDigestPoint `json:"negatives"`
	Records   []libraryReviewDigestPoint `json:"records"`
}

type aiTranscribeResp struct {
	Text     string  `json:"text"`
	Language string  `json:"language,omitempty"`
	Duration float64 `json:"duration,omitempty"`
}
