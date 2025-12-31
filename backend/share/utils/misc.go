package utils

import (
	"fmt"
	"os"
	"time"
)

func GetSqlLog(module string) *os.File {
	// 打开 sql.log 文件（如果没有则创建）
	// 确保 dblog 目录存在
	if _, err := os.Stat("./dblog"); os.IsNotExist(err) {
		err = os.Mkdir("./dblog", 0755)
		if err != nil {
			panic("failed to create dblog directory")
		}
	}
	// 确定module不为空
	if module != "" {
		if _, err := os.Stat("./dblog/" + module); os.IsNotExist(err) {
			err = os.Mkdir("./dblog/"+module, 0755)
			if err != nil {
				panic("failed to create dblog module directory")
			}
		}
	}
	// 按日期和表名区分日志文件
	dateStr := time.Now().Format("2006-01-02")
	logPath := fmt.Sprintf("./dblog%s/%s.log", "/"+module, dateStr)
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0666)
	if err != nil {
		panic("failed to open log file")
	}
	return file
}
