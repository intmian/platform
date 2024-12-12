package mods

import "testing"

func TestBaidu_Do(t *testing.T) {
	v := "aaa#废弃"
	runes := []rune(v)
	if len(runes) > 3 && string(runes[len(runes)-3:]) == "#废弃" {
		t.Log("跳过")
	} else {
		t.Log("不跳过")
	}
}
