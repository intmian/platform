package mods

import (
	"os"
	"testing"
	"time"
)

func Test_getNews(t *testing.T) {
	time := time.Now().Format("2006_01_02_15_04_05")
	f, _ := os.Create("gnews_" + time + ".md")
	defer f.Close()
	s, err := getNews("ee54b7595ba81fc612c56689416abf6a", "https://www.gptapi.us/v1", "sk-vaUaIg9DO7XnZuhF63B908D75bB04327B3B9306bAfE50bEc", false)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(s)
}
