package main

import (
	"encoding/json"
	"testing"
)

func TestTransformTaskMovesNotesAndPreservesUnknownFields(t *testing.T) {
	original := `{
      "pictureAddress":"cover",
      "unknownFuture":{"keep":true},
      "currentRound":0,
      "mainScoreRoundIndex":0,
      "mainScoreLogIndex":3,
      "createdAt":"2026-01-01T00:00:00Z",
      "updatedAt":"2026-02-01T00:00:00Z",
      "rounds":[{
        "name":"首周目",
        "startTime":"2026-01-01T00:00:00Z",
        "logs":[
          {"type":4,"time":"2026-01-01T00:00:00Z"},
          {"type":2,"time":"2026-01-02T00:00:00Z","comment":"第一条"},
          {"type":2,"time":"2026-01-03T00:00:00Z","comment":"添加到库"},
          {"type":1,"time":"2026-01-04T00:00:00Z","score":5,"comment":"总评"}
        ]
      }]
    }`
	migration, err := transformTask("user", 42, original)
	if err != nil {
		t.Fatal(err)
	}
	if len(migration.Notes) != 1 || migration.Notes[0].Content != "第一条" {
		t.Fatalf("unexpected notes: %#v", migration.Notes)
	}
	if migration.LegacyAddCount != 1 || migration.RoundCount != 1 {
		t.Fatalf("unexpected counts: %#v", migration)
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal([]byte(migration.TransformedNote), &root); err != nil {
		t.Fatal(err)
	}
	if string(root["updatedAt"]) != `"2026-02-01T00:00:00Z"` {
		t.Fatalf("updatedAt changed: %s", root["updatedAt"])
	}
	if _, ok := root["unknownFuture"]; !ok {
		t.Fatal("unknown field was dropped")
	}
	var mainIndex int
	if err := json.Unmarshal(root["mainScoreLogIndex"], &mainIndex); err != nil {
		t.Fatal(err)
	}
	if mainIndex != 2 {
		t.Fatalf("main score index=%d want 2", mainIndex)
	}
	var rounds []map[string]json.RawMessage
	if err := json.Unmarshal(root["rounds"], &rounds); err != nil {
		t.Fatal(err)
	}
	var roundID string
	if err := json.Unmarshal(rounds[0]["id"], &roundID); err != nil || roundID == "" {
		t.Fatalf("round id missing: %v", err)
	}
	var logs []map[string]json.RawMessage
	if err := json.Unmarshal(rounds[0]["logs"], &logs); err != nil {
		t.Fatal(err)
	}
	if len(logs) != 3 {
		t.Fatalf("logs=%d want 3", len(logs))
	}
	var normalizedType int
	if err := json.Unmarshal(logs[1]["type"], &normalizedType); err != nil {
		t.Fatal(err)
	}
	if normalizedType != libraryLogTypeAddToLibrary {
		t.Fatalf("legacy type=%d", normalizedType)
	}
	if _, ok := logs[1]["comment"]; ok {
		t.Fatal("legacy add comment should be removed")
	}

	retry, err := transformTask("user", 42, original)
	if err != nil {
		t.Fatal(err)
	}
	if retry.Notes[0].ID != migration.Notes[0].ID || retry.TransformedNote != migration.TransformedNote {
		t.Fatal("deterministic migration changed across runs")
	}
}

func TestTransformTaskRejectsInvalidData(t *testing.T) {
	cases := []string{
		`not-json`,
		`{"rounds":[]}`,
		`{"mainScoreRoundIndex":0,"rounds":[{"logs":[]}]}`,
		`{"rounds":[{"logs":[{"type":2,"time":"bad","comment":"x"}]}]}`,
		`{"mainScoreRoundIndex":0,"mainScoreLogIndex":0,"rounds":[{"logs":[{"type":2,"time":"2026-01-01T00:00:00Z","comment":"x"}]}]}`,
	}
	for _, input := range cases {
		if _, err := transformTask("user", 1, input); err == nil {
			t.Fatalf("expected error for %s", input)
		}
	}
}
