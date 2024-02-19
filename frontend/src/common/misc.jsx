import {useEffect, useState} from "react";

export function TimeFromStart({startTime, width}) {
    // 用于在组件刷新时重新计算时间
    useEffect(() => {
        setPassTime(new Date().getTime() - new Date(startTime).getTime());
    }, [startTime])
    const [passTime, setPassTime] = useState(new Date().getTime() - new Date(startTime).getTime());
    useEffect(() => {
        const interval = setInterval(() => {
            setPassTime(passTime + 1000);
        }, 1000);
        return () => clearInterval(interval);
    }, [passTime])

    // 转换为xx天xx小时xx分xx秒
    let day = Math.floor(passTime / (24 * 3600 * 1000));
    let leave1 = passTime % (24 * 3600 * 1000);
    let hours = Math.floor(leave1 / (3600 * 1000));
    let leave2 = leave1 % (3600 * 1000);
    let minutes = Math.floor(leave2 / (60 * 1000));
    let leave3 = leave2 % (60 * 1000);
    let seconds = Math.floor(leave3 / 1000);
    let str = '';
    // 数字默认两位
    if (day > 0) {
        str += `${day} 天 `;
    }
    if (hours > 0 || str !== '') {
        str += `${hours} 小时 `;
    }
    if (minutes > 0 || str !== '') {
        str += `${minutes} 分 `;
    }
    str += `${seconds} 秒`;
    return <div
        style={{
            width: width,
        }}
    >{str}</div>;
}