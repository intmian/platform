package todone

import (
	"strings"
	"testing"
)

func TestValidateLibraryScoreDetailInput(t *testing.T) {
	input, err := validateLibraryScoreDetailInput(LibraryScoreDetailInput{
		Mode: " complex ", Comment: " main ",
		ObjScore: &LibraryScoreDimensionInput{Value: 4, Adjustment: 1, Comment: " obj "},
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Mode != "complex" || input.Comment != "main" || input.ObjScore == nil || input.ObjScore.Comment != "obj" {
		t.Fatalf("unexpected normalized input: %#v", input)
	}

	simple, err := validateLibraryScoreDetailInput(LibraryScoreDetailInput{
		Mode: "simple", ObjScore: &LibraryScoreDimensionInput{Value: 4},
	})
	if err != nil || simple.ObjScore != nil {
		t.Fatalf("simple mode should strip dimensions: %#v err=%v", simple, err)
	}

	for _, invalid := range []LibraryScoreDetailInput{
		{Mode: "unknown"},
		{Mode: "complex", ObjScore: &LibraryScoreDimensionInput{Value: 0}},
		{Mode: "complex", ObjScore: &LibraryScoreDimensionInput{Value: 3, Adjustment: 2}},
		{Mode: "simple", Comment: strings.Repeat("x", MaxLibraryScoreDetailBytes+1)},
	} {
		if _, err := validateLibraryScoreDetailInput(invalid); err == nil {
			t.Fatalf("expected invalid input: %#v", invalid)
		}
	}
}
