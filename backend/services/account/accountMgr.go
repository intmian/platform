package account

import (
	"encoding/json"
	"errors"
	"github.com/intmian/mian_go_lib/tool/cipher"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/multi"
	"github.com/intmian/mian_go_lib/xstorage"
	share2 "github.com/intmian/platform/backend/share"
	"regexp"
	"time"
)

/*
accountMgr 账户管理
仅进行数据管理，鉴权请去上层
密码以 sha256(salt1+密码+账户) 存储
*/
type accountMgr struct {
	accDb       xstorage.XStorage
	iniAdminPwd string
	initTag     misc.InitTag
	idLock      *multi.UnitLock[string] // 避免同事操作
}

type PermissionInfo struct {
	Token       string
	Permissions []share2.Permission
}

type accountDbData struct {
	ID2PerInfos    map[int]*PermissionInfo `json:"token2Permissions"`
	LastTokenIndex int                     `json:"lastTokenIndex"`
	Creator        string                  `json:"creator"`
	CreateAt       time.Time               `json:"createAt"`
	ModifyAt       time.Time               `json:"modifyAt"`
}

const salt = "秋天真猪23333"

func getToken(account string, password string) string {
	return cipher.Sha2562String(salt + password + account)
}

func (a *accountMgr) Init(iniAdminPwd string) error {
	err := a.accDb.Init(xstorage.XStorageSetting{
		// 上层用unitLock了，但是有些操作还是会并发的,不要全局锁
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.UseDisk, xstorage.FullInitLoad, xstorage.MultiSafe),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   "account.db",
	})
	if err != nil {
		return errors.Join(err, ErrAccDbInitErr)
	}
	a.iniAdminPwd = iniAdminPwd
	a.initTag.SetInitialized()
	a.idLock = multi.NewUnitLock[string]()
	return nil
}

func checkPwd(pwd string) bool {
	// 必须且只能含有数字、字母、下划线
	// 长度必须在6-20之间
	reg := regexp.MustCompile(`^\w{6,20}$`)
	return reg.MatchString(pwd)
}

func (a *accountMgr) getAllAccount() (map[string][]PermissionInfo, error) {
	if !a.initTag.IsInitialized() {
		return nil, ErrAccountMgrNotInit
	}
	// 直接从数据库读最新的 不考虑锁
	dataMap, err := a.accDb.GetAll()
	if err != nil {
		return nil, errors.Join(err, ErrGetAllAccountFailed)
	}
	ret := make(map[string][]PermissionInfo)
	for k, v := range dataMap {
		var ad accountDbData
		err = json.Unmarshal([]byte(xstorage.ToBase[string](v)), &ad)
		if err != nil {
			return nil, errors.Join(err, ErrJsonUnmarshalFailed)
		}
		var perInfos []PermissionInfo
		for _, v := range ad.ID2PerInfos {
			perInfos = append(perInfos, *v)
		}
		ret[k] = perInfos
	}
	return ret, nil
}

func (a *accountMgr) register(account string, creator string) error {
	a.idLock.Lock(account)
	defer a.idLock.Unlock(account)
	if !a.initTag.IsInitialized() {
		return ErrAccountMgrNotInit
	}
	sv, err := a.accDb.Get(account)
	if err != nil {
		return errors.Join(err, ErrAccDbGetErr)
	}
	var ad accountDbData
	if sv != nil {
		dbStr := xstorage.ToBase[string](sv)
		err = json.Unmarshal([]byte(dbStr), &ad)
	} else {
		ad.CreateAt = time.Now()
		ad.Creator = creator
	}
	ad.ModifyAt = time.Now()
	dbStr, err := json.Marshal(ad)
	if err != nil {
		return errors.Join(err, ErrJsonMarshalErr)
	}
	err = a.accDb.Set(account, xstorage.ToUnit[string](string(dbStr), xstorage.ValueTypeString))
	if err != nil {
		return errors.Join(err, ErrAccDbSetErr)

	}
	return nil
}

func (a *accountMgr) changePermission(account string, tokenID string, permissions []share2.Permission) error {
	a.idLock.Lock(account)
	defer a.idLock.Unlock(account)
	if !a.initTag.IsInitialized() {
		return ErrAccountMgrNotInit
	}
	sv, err := a.accDb.Get(account)
	if err != nil {
		return errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		return ErrAccountNotExist
	}
	var ad *accountDbData
	ad = xstorage.UnitToJStruct[accountDbData](sv)
	// 判断是否存在,如果存在就更改
	find := false
	for _, v := range ad.ID2PerInfos {
		if v.Token == tokenID {
			find = true
			v.Permissions = permissions
			break
		}
	}

	if !find {
		return ErrTokenNotExist
	}

	err = a.accDb.Set(account, xstorage.JStructToUnit(ad))
	if err != nil {
		return errors.Join(err, ErrAccDbSetErr)
	}
	return nil
}

func (a *accountMgr) addPermission(account string, password string, permissions []share2.Permission) (int, error) {
	a.idLock.Lock(account)
	defer a.idLock.Unlock(account)
	if !a.initTag.IsInitialized() {
		return -1, ErrAccountMgrNotInit
	}
	if !checkPwd(password) {
		return -1, ErrPasswordFormatError
	}
	sv, err := a.accDb.Get(account)
	if err != nil {
		return -1, errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		return -1, ErrAccountNotExist
	}
	var ad accountDbData
	dbStr := xstorage.ToBase[string](sv)
	err = json.Unmarshal([]byte(dbStr), &ad)
	if err != nil {
		return -1, errors.Join(err, ErrJsonUnmarshalFailed)
	}
	token := getToken(account, password)

	// 检查是否有token重复
	for _, v := range ad.ID2PerInfos {
		if v.Token == token {
			return -1, ErrTokenAlreadyExist
		}
	}

	per := new(PermissionInfo)
	per.Token = token
	per.Permissions = permissions
	ad.LastTokenIndex++
	if ad.ID2PerInfos == nil {
		ad.ID2PerInfos = make(map[int]*PermissionInfo)
	}
	ad.ID2PerInfos[ad.LastTokenIndex] = per
	err = a.accDb.Set(account, xstorage.JStructToUnit[accountDbData](&ad))
	if err != nil {
		return -1, errors.Join(err, ErrAccDbSetErr)
	}
	return ad.LastTokenIndex, nil
}

func (a *accountMgr) deletePermission(account string, tokenID int) error {
	if !a.initTag.IsInitialized() {
		return ErrAccountMgrNotInit
	}
	a.idLock.Lock(account)
	defer a.idLock.Unlock(account)
	sv, err := a.accDb.Get(account)
	if err != nil {
		return errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		return ErrAccountNotExist
	}
	var ad *accountDbData
	ad = xstorage.UnitToJStruct[accountDbData](sv)
	// 判断是否存在
	_, ok := ad.ID2PerInfos[tokenID]
	if !ok {
		return ErrTokenNotExist
	}

	delete(ad.ID2PerInfos, tokenID)

	err = a.accDb.Set(account, xstorage.JStructToUnit(ad))
	if err != nil {
		return errors.Join(err, ErrAccDbSetErr)
	}
	return nil
}

func (a *accountMgr) deregister(account string) error {
	if !a.initTag.IsInitialized() {
		return ErrAccountMgrNotInit
	}
	a.idLock.Lock(account)
	defer a.idLock.Unlock(account)
	// 先判断有没有
	_, err := a.accDb.Get(account)
	if err != nil {
		return errors.Join(err, ErrAccDbGetErr)
	}
	// 删除
	err = a.accDb.Delete(account)
	if err != nil {
		return errors.Join(err, ErrAccDbDeleteErr)
	}
	return nil
}

func (a *accountMgr) getPermission(account string) (map[int]*PermissionInfo, error) {
	if !a.initTag.IsInitialized() {
		return nil, ErrAccountMgrNotInit
	}
	a.idLock.RLock(account)
	defer a.idLock.RUnlock(account)
	sv, err := a.accDb.Get(account)
	if err != nil {
		return nil, errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		return nil, ErrAccountNotExist
	}
	var ad accountDbData
	dbStr := xstorage.ToBase[string](sv)
	err = json.Unmarshal([]byte(dbStr), &ad)
	if err != nil {
		return nil, errors.Join(err, ErrJsonUnmarshalFailed)
	}
	return ad.ID2PerInfos, nil
}

func (a *accountMgr) checkPermission(account string, pwd string) ([]share2.Permission, error) {
	if !a.initTag.IsInitialized() {
		return nil, ErrAccountMgrNotInit
	}
	var sv *xstorage.ValueUnit
	var err error
	func() {
		a.idLock.Lock(account)
		a.idLock.Unlock(account)
		sv, err = a.accDb.Get(account)
	}()
	if err != nil {
		return nil, errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		if account == "admin" {
			// 没有账号去读初始密码，换言之建立了第一个账户以后默认的这个admin账号密码就没用了
			if getToken(account, pwd) == getToken(account, a.iniAdminPwd) {
				// 注册一个admin账号
				err = a.register(account, "admin")
				if err != nil {
					return nil, errors.Join(err, errors.New("register admin failed"))
				}
				// 增加一个admin权限
				_, err = a.addPermission(account, pwd, []share2.Permission{share2.PermissionAdmin})
				if err != nil {
					return nil, errors.Join(err, errors.New("add admin permission failed"))
				}
				return []share2.Permission{share2.PermissionAdmin}, nil
			} else {
				return nil, ErrTokenNotExist
			}
		}
		return nil, ErrAccountNotExist
	}
	var ad accountDbData
	dbStr := xstorage.ToBase[string](sv)
	err = json.Unmarshal([]byte(dbStr), &ad)
	if err != nil {
		return nil, errors.Join(err, ErrJsonUnmarshalFailed)
	}
	token := getToken(account, pwd)
	for _, v := range ad.ID2PerInfos {
		if v.Token == token {
			return v.Permissions, nil
		}
	}
	return nil, ErrTokenNotExist
}
