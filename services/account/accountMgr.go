package account

import (
	"github.com/intmian/mian_go_lib/tool/cipher"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/pkg/errors"
	"regexp"
)

/*
accountMgr 账户管理
必须拥有admin权限才能分配账户
密码以 sha256(salt1+密码+账户) 存储
*/
type accountMgr struct {
	accDb   xstorage.XStorage
	initTag misc.InitTag
}

const salt = "秋天真猪23333"

func getToken(account string, password string) string {
	return cipher.Sha2562String(salt + password + account)
}

func (a *accountMgr) Init() error {
	err := a.accDb.Init(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.MultiSafe, xstorage.UseDisk, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   "test.db",
	})
	if err != nil {
		return errors.WithMessage(err, "accDb Init err")
	}
	a.initTag.SetInitialized()
	return nil
}

func checkPwd(pwd string) bool {
	// 必须且只能含有数字、字母、下划线
	// 长度必须在6-20之间
	reg := regexp.MustCompile(`^\w{6,20}$`)
	return reg.MatchString(pwd)
}

func (a *accountMgr) register(account string, password string) error {
	if !a.initTag.IsInitialized() {
		return errors.New("accountMgr not init")
	}
	token := getToken(account, password)
	err := a.accDb.Set(account, xstorage.ToUnit[string](token, xstorage.ValueTypeString))
	if err != nil {
		return errors.WithMessage(err, "accDb Set err")
	}
	return nil
}

func (a *accountMgr) deregister(account string) error {
	if !a.initTag.IsInitialized() {
		return errors.New("accountMgr not init")
	}
	// 先判断有没有
	_, err := a.accDb.Get(account)
	if err != nil {
		return errors.WithMessage(err, "accDb Get err")
	}
	// 删除
	err = a.accDb.Delete(account)
	if err != nil {
		return errors.WithMessage(err, "accDb Delete err")
	}
	return nil
}

func (a *accountMgr) checkToken(account string, password string) bool {
	if !a.initTag.IsInitialized() {
		return false
	}
	token, err := a.accDb.Get(account)
	if err != nil {
		return false
	}
	if xstorage.ToBase[string](token) != getToken(account, password) {
		return false
	}
	return true
}
