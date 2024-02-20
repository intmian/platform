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

export async function sendLogin(values) {
    try {
        const response = await fetch(config.api_base_url + '/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const result = await response.json();
        if (result.code === 0) {
            return result.username
        } else {
            return ''
        }
    } catch (error) {
        return ''
    }
}