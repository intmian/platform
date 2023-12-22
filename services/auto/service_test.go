package auto

import (
	"fmt"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/xlog"
	"github.com/intmian/mian_go_lib/tool/xpush"
	"github.com/intmian/mian_go_lib/tool/xstorage"
	"github.com/intmian/platform/services/share"
	"os"
	"strings"
	"testing"
)

func MakeServiceShare() *share.ServiceShare {
	s := share.ServiceShare{}
	token := ""
	secret := ""

	// 从本地文件 dingding_test.txt 读取测试内容token和secret
	file, _ := os.Open("E:\\my_code_out\\platform\\mian_go_lib\\tool\\xpush\\dingding_test.txt")
	defer file.Close()
	buf := make([]byte, 1024)
	n, _ := file.Read(buf)
	str := string(buf[:n])
	strs := strings.Split(str, "\r\n")
	token = strs[0]
	secret = strs[1]

	s.Push = xpush.NewDingMgr(&xpush.DingSetting{
		Token:             token,
		Secret:            secret,
		SendInterval:      60,
		IntervalSendCount: 20,
	}, "测试")
	pushStyle := []xpush.PushType{xpush.PushType_PUSH_PUSH_DEER}
	f := func(msg string) bool {
		fmt.Println(msg)
		return true
	}
	l := xlog.NewMgr("D:/log", f, s.Push, pushStyle, true, true, true, true, true, "target@intmian.com", "from@intmian.com", "testlog")

	s.Log = l
	m, _ := xstorage.NewMgr(xstorage.KeyValueSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.MultiSafe),
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
