export class PermissionShowData {
    tokenID = '';
    permission = [];
    needSave = false;
    saving = false;
    deleting = false;
}

export class AccountPanelShowData {
    name = '';
    permissionData = [];
    Adding = false;  // 打开一个创建权限的对话框
    deleting = false;
}


export function accountHttp2ShowData(httpData, name) {
    let showData = new AccountPanelShowData();
    showData.name = name;
    for (let key in httpData) {
        let permission = new PermissionShowData();
        permission.tokenID = key;
        permission.permission = httpData[key];
        showData.permissionData.push(permission);
    }
    return showData;
}