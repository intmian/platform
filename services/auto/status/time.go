package status

import (
	"fmt"
	"time"
)

type Status struct {
	startTime time.Time
}

func (t *Status) GetTimeStr() string {
	nowStr := time.Now().Format("2006-01-02 15:04:05")
	duration := time.Now().Sub(t.startTime)
	durationStr := ""
	if duration.Seconds() < 60 {
		durationStr += fmt.Sprintf("%d秒", int(duration.Seconds()))
	}
	if int(duration.Minutes()) > 0 {
		durationStr = fmt.Sprintf("%d分 ", int(duration.Minutes())%60) + durationStr
	}
	if int(duration.Hours()) > 0 {
		durationStr = fmt.Sprintf("%d小时 ", int(duration.Hours())%24) + durationStr
	}
	if int(duration.Hours()) >= 24 {
		durationStr = fmt.Sprintf("%d天 ", int(duration.Hours()/24)) + durationStr
	}
	return nowStr + " 已运行:" + durationStr + "\n"
}

var GStatus = Status{time.Now()}
