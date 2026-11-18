package mods

import (
	"net/http"
	"net/url"
	"testing"
)

func TestGetDayReport(t *testing.T) {
	got, err := GetDayReport(&http.Client{
		Transport: &http.Transport{
			Proxy: http.ProxyURL(&url.URL{
				Scheme: "http",
				Host:   "localhost:7890",
			}),
		},
	}, "杭州", "6c97a0d52500409e985942f40f0f915a")
	if err != nil {
		t.Errorf("GetDayReport() error = %v", err)
	}
	print("got:", got)
}
