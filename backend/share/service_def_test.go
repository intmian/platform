package share

import (
	"encoding/json"
	"testing"
)

func TestMsg(t *testing.T) {
	type args struct {
		S string
		I int
		F float64
	}
	test := args{
		S: "test",
		I: 1,
		F: 1.1,
	}
	testStr, _ := json.Marshal(test)
	m1 := MakeMsg("test", test)
	m2 := MakeMsgJson("test", string(testStr))

	if m1.Cmd() != m2.Cmd() || m1.Cmd() != "test" {
		t.Error("cmd error")
	}

	var test1 args
	var test2 args
	if err := m1.Data(&test1); err != nil {
		t.Error("m1 data error")
	}
	if err := m2.Data(&test2); err != nil {
		t.Error("m2 data error")
	}
	if test1 != test2 {
		t.Error("data error")
	}
}
