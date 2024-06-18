export class PermissionShowData {
    tokenID = '';
    permission = [];
}

export class AccountPanelShowData {
    name = '';
    permissionData = [];
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