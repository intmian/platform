export function CheckLogin() {
    // 请求 /api/admin 查询权限
    const fetchData = async () => {
        try {
            const response = await fetch('/api/check', {
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
                    return ""
                }
                return result.data.User;
            }
        } catch (error) {
            return ""
        }
    };

    return fetchData();
}