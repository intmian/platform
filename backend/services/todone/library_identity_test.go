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
