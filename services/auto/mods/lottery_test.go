package mods

import (
	"testing"
)

func TestLottery(t *testing.T) {
	l := Lottery{}
	l.Init()
	l.Do()
}
