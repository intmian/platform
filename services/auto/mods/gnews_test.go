package mods

import (
	"os"
	"testing"
)

func Test_getNews(t *testing.T) {
	f, _ := os.Create("openai_test.md")
	defer f.Close()
	s, err := getNews("ee54b7595ba81fc612c56689416abf6a", "https://api.openai-proxy.org/v1", "sk-7A4jfmtJ3QXhef0x9g9YIIxTLwK15C9T0vTsehdBlNLExMxk", true)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(s)
}
