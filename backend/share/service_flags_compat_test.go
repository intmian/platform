package share

import "testing"

// Persisted service identifiers must keep their numeric meaning after Note Mini retirement.
func TestServiceFlagNumericCompatibility(t *testing.T) {
	for _, tc := range []struct {
		name string
		got  SvrFlag
		want SvrFlag
	}{
		{"none", FlagNone, 0},
		{"auto", FlagAuto, 1},
		{"account", FlagAccount, 3},
		{"cmd", FlagCmd, 4},
		{"todone", FlagTodone, 5},
	} {
		if tc.got != tc.want {
			t.Errorf("%s service flag = %d, want %d", tc.name, tc.got, tc.want)
		}
	}
}
