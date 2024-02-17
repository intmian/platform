import {useEffect, useState} from "react";

export function TimeFromStart({startTime, width}) {
    let passTime = new Date().getTime() - new Date(startTime).getTime();
    const [passTimeReal, setPassTimeReal] = useState(passTime);
    const [passTimeStr, setPassTimeStr] = useState('');
    useEffect(() => {
        // 转换为xx天xx小时xx分xx秒
        let day = Math.floor(passTimeReal / (24 * 3600 * 1000));
        let leave1 = passTimeReal % (24 * 3600 * 1000);
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
        if (seconds > 0 || str !== '') {
            str += `${seconds} 秒`;
        }

        setPassTimeStr(str);
        const interval = setInterval(() => {
            setPassTimeReal(passTimeReal + 1000);
            // 转换为xx天xx小时xx分xx秒
            let day = Math.floor(passTimeReal / (24 * 3600 * 1000));
            let leave1 = passTimeReal % (24 * 3600 * 1000);
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
            if (seconds > 0 || str !== '') {
                str += `${seconds} 秒`;
            }
            setPassTimeStr(str);
        }, 1000);
        return () => clearInterval(interval);
    }, [passTimeReal, passTimeStr])
    return <div
        style={{
            width: width,
        }}
    >{passTimeStr}</div>;
}