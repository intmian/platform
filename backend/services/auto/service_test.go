package auto

import (
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xlog"
	"github.com/intmian/mian_go_lib/xpush"
	"github.com/intmian/mian_go_lib/xpush/pushmod"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/share"
	"os"
	"strings"
	"testing"
)

func MakeServiceShare() *share.ServiceShare {
	s := share.ServiceShare{}
	token := ""
	secret := ""

	// 从本地文件 dingding_test.txt 读取测试内容token和secret
	file, _ := os.Open("E:\\my_code_out\\platform\\mian_go_lib\\xpush\\pushmod\\dingding_test.txt")
	defer file.Close()
	buf := make([]byte, 1024)
	n, _ := file.Read(buf)
	str := string(buf[:n])
	strs := strings.Split(str, "\r\n")
	token = strs[0]
	secret = strs[1]

	push, err := xpush.NewXPush(true)
	if err != nil {
		panic(err)
	}
	err = push.AddDingDing(pushmod.DingSetting{
		Token:             token,
		Secret:            secret,
		SendInterval:      60,
		IntervalSendCount: 20,
	})
	push.Push("这是测试消息", "这是测试消息", false)
	s.Push = push
	if err != nil {
		panic(err)
	}
	d := xlog.DefaultSetting()
	d.LogAddr = "E:/log"
	d.PushInfo.PushMgr = push
	s.Log, _ = xlog.NewXLog(d)
	m, _ := xstorage.NewXStorage(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.MultiSafe, xstorage.UseDisk, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   "test.db",
	})
	s.Storage = m
	return &s
}

func TestService(t *testing.T) {
	// Manual
	serviceShare := MakeServiceShare()
	var s Service
	err := s.Start(*serviceShare)
	if err != nil {
		t.Fatal(err)
	}
}
