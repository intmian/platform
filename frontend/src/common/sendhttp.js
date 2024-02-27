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
                if (result.data.ValidTime < new Date().getTime() / 1000) {
                    callback("")
                } else {
                    callback(result.data.User)
                }
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
    console.log("sendSetStorage", key, value, type)
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