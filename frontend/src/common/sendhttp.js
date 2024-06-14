import config from "../config.json"

export function SendCheckLogin(callback) {
    // 请求 /api/admin 查询权限

    const fetchData = async () => {
        try {
            const response = await fetch(config.api_base_url + '/check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const result = await response.json();
            if (result.code === 0) {
                callback(result.data)
            } else {
                callback(null)
            }
        } catch (error) {
            callback(null)
        }
    };
    fetchData();
}

export function SendStartStopService(callback, start, name) {
    ///service/:name/start
    let cmd = start ? "start" : "stop"
    const fetchData = async () => {
        try {
            const response = await fetch(config.api_base_url + '/admin/service/' + name + '/' + cmd, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const result = await response.json();
            callback(result)
        } catch (error) {
            callback(null)
        }
    };
    fetchData()
}

export function SendGetLastLog(callback) {
    const fetchData = async () => {
        try {
            const response = await fetch(config.api_base_url + '/admin/log/get', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const result = await response.json();
            if (result.code === 0) {
                callback(null)
            }
            callback(result)
        } catch (error) {
            callback(null)
        }
    };
    fetchData()
}

export function SendGetAdminServices(callback) {
    const fetchData = async () => {
        try {
            const response = await fetch(config.api_base_url + '/admin/services', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const result = await response.json();
            callback(result)
            // 等待1秒后加载
        } catch (error) { /* empty */
        }
    };
    fetchData()
}

export function sendLogin(values, callback) {
    const fetchData = async () => {
        try {
            const response = await fetch(config.api_base_url + '/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // 通过表单发送数据
                body: JSON.stringify(values),
            });

            if (!response.ok) {
                callback(null)
                return
            }
            const result = await response.json();
            callback(result)
        } catch (error) {
            callback(null)
        }
    };
    fetchData()
}

export function sendGetStorage(perm, useRe, callback) {
    const fetchData = async () => {
        try {
            let response = null
            if (perm === "") {
                response = await fetch(config.api_base_url + '/admin/storage/get_all', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            } else {
                response = await fetch(config.api_base_url + '/admin/storage/get', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    // 通过表单发送数据
                    body: JSON.stringify({perm: perm, useRe: useRe}),
                });
            }


            if (!response.ok) {
                callback(null)
            }

            const result = await response.json();
            callback(result)
            // 等待1秒后加载
        } catch (error) { /* empty */
            callback(null)
        }
    };
    fetchData()
}

export function sendSetStorage(key, value, type, callback) {
    type = parseInt(type)
    // 为了方便后端json解析，这里将value转换为json字符串
    value = JSON.stringify(value)
    const fetchData = async () => {
        try {
            const response = await fetch(config.api_base_url + '/admin/storage/set', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // 通过表单发送数据
                body: JSON.stringify({key: key, value: value, type: type}),
            });

            if (!response.ok) {
                callback(null)
                return
            }
            const result = await response.json();
            callback(result)
        } catch (error) {
            callback(null)
        }
    };
    fetchData()
}

// 通用的异步POST请求，只适配platform的通用后端返回格式，如果code不为0，或者没有code字段，返回null或者不为200的状态码，返回null
async function UniPost(url, req) {
    let result = {}
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req),
        });

        if (!response.ok || (response.code !== undefined && response.code !== 0)) {
            console.debug('UniPost failed:', response)
            result.ok = false
            return result
        }
        result.ok = true
        let data = await response.json()
        if (data.data !== undefined) {
            result.data = data.data
        }
        return result
    } catch (error) {
        result.ok = false
        console.debug('UniPost failed:', error)
        return result
    }
}

export function sendRegister(account, callback) {
    let req = {
        account: account,
    }
    UniPost(config.api_base_url + '/service/account/register', req).then(callback)
}

export function sendDeregister(account, callback) {
    let req = {
        account: account,
    }
    UniPost(config.api_base_url + '/service/account/deregister', req).then(callback)
}

export function sendCheckToken(account, pwd, callback) {
    let req = {
        account: account,
        pwd: pwd,
    }
    UniPost(config.api_base_url + '/service/account/checkToken', req).then(callback)
}

export function sendDelToken(account, tokenID, callback) {
    let req = {
        account: account,
        tokenID: tokenID,
    }
    UniPost(config.api_base_url + '/service/account/delToken', req).then(callback)
}

export function sendChangeToken(account, tokenID, pers, callback) {
    let req = {
        account: account,
        tokenID: tokenID,
        pers: pers,
    }
    UniPost(config.api_base_url + '/service/account/changeToken', req).then(callback)
}

export function sendGetAllAccount(callback) {
    let req = {}
    UniPost(config.api_base_url + '/service/account/getAllAccount', req).then(callback)
}

export function sendCreateToken(account, pwd, pers, callback) {
    let req = {
        account: account,
        pwd: pwd,
        pers: pers,
    }
    UniPost(config.api_base_url + '/service/account/createToken', req).then(callback)
}

export function sendCfgPlatGet(callback) {
    let req = {}
    UniPost(config.api_base_url + '/cfg/plat/get', req).then(callback)
}

export function sendCfgPlatSet(key, value, callback) {
    let req = {
        key: key,
        val: value,
    }
    UniPost(config.api_base_url + '/cfg/plat/set', req).then(callback)
}

export function sendCfgServiceGet(svr, callback) {
    let req = {
        svr: svr,
    }
    UniPost(config.api_base_url + '/cfg/' + svr + '/get', req).then(callback)
}

export function sendCfgServiceSet(svr, key, value, callback) {
    let req = {
        key: key,
        val: value,
    }
    UniPost(config.api_base_url + '/cfg/' + svr + '/set', req).then(callback)
}

export function sendCfgServiceUserGet(svr, user, callback) {
    let req = {
        svr: svr,
        user: user,
    }
    UniPost(config.api_base_url + '/cfg/' + svr + '/' + user + '/get', req).then(callback)
}

export function sendCfgServiceUserSet(svr, user, key, value, callback) {
    let req = {
        key: key,
        val: value,
    }
    UniPost(config.api_base_url + '/cfg/' + svr + '/' + user + '/set', req).then(callback)
}