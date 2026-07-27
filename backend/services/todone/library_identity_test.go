package todone

import "testing"

func TestParseLibraryRoundIDs(t *testing.T) {
	ids, err := parseLibraryRoundIDs(`{"rounds":[{"id":"11111111-1111-4111-8111-111111111111"},{"id":"22222222-2222-4222-8222-222222222222"}],"other":"kept"}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 || ids[0] != "11111111-1111-4111-8111-111111111111" || ids[1] != "22222222-2222-4222-8222-222222222222" {
		t.Fatalf("unexpected ids: %#v", ids)
	}
	for _, input := range []string{
		`{"rounds":[]}`,
		`{"rounds":[{"id":""}]}`,
		`{"rounds":[{"id":"not-a-uuid"}]}`,
		`{"rounds":[{"id":"11111111-1111-4111-8111-111111111111"},{"id":"11111111-1111-4111-8111-111111111111"}]}`,
		`not-json`,
	} {
		if _, err := parseLibraryRoundIDs(input); err == nil {
			t.Fatalf("expected error for %s", input)
		}
	}
}

func TestFindLibraryScoreRoundID(t *testing.T) {
	roundID := "11111111-1111-4111-8111-111111111111"
	scoreID := "22222222-2222-4222-8222-222222222222"
	note := `{"rounds":[{"id":"` + roundID + `","logs":[{"type":0},{"id":"` + scoreID + `","type":1}]}]}`
	actualRoundID, found, err := findLibraryScoreRoundID(note, scoreID)
	if err != nil || !found || actualRoundID != roundID {
		t.Fatalf("round=%q found=%v err=%v", actualRoundID, found, err)
	}
	if _, found, err = findLibraryScoreRoundID(note, "33333333-3333-4333-8333-333333333333"); err != nil || found {
		t.Fatalf("unexpected missing result: found=%v err=%v", found, err)
	}
	for _, input := range []string{
		`{"rounds":[{"id":"` + roundID + `","logs":[{"type":1}]}]}`,
		`{"rounds":[{"id":"` + roundID + `","logs":[{"id":"bad","type":1}]}]}`,
		`{"rounds":[{"id":"` + roundID + `","logs":[{"id":"` + scoreID + `","type":1},{"id":"` + scoreID + `","type":1}]}]}`,
	} {
		if _, _, err := findLibraryScoreRoundID(input, scoreID); err == nil {
			t.Fatalf("expected error for %s", input)
		}
	}
}
