import {useMemo} from 'react';
import {Calendar} from 'antd';
import dayjs, {Dayjs} from 'dayjs';
import zhLocale from 'antd/lib/calendar/locale/zh_CN.js';
import './love.css';

const anniversaryDate: Dayjs = dayjs('2022-12-18');

const Anniversary = () => {
    // 50 个随机位置、随机时长（2 到 5 秒）的漂浮爱心；只在挂载时生成一次
    const hearts = useMemo(() => Array.from({length: 50}).map(() => ({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        duration: Math.random() * 3 + 2,
    })), []);

    return <div className="love-page">
        {hearts.map((h, index) => (
            <div
                key={index}
                className="love-floating-heart"
                style={{top: h.top, left: h.left, animationDuration: `${h.duration}s`}}
            >
                💖
            </div>
        ))}
        <LovePanel/>
    </div>;
};

const LovePanel = () => {
    const today = dayjs();
    const daysTogether = today.diff(anniversaryDate, 'day');
    const nextAnniversary = anniversaryDate.add(Math.floor(daysTogether / 365) + 1, 'year');
    const daysToNextAnniversary = nextAnniversary.diff(today, 'day');

    return (
        <div className="love-panel">
            <div className="love-panel-row"><div className="love-center-heart">❤️</div></div>
            <div className="love-panel-row"><p className="love-large-text">爱你宝宝</p></div>
            <div className="love-panel-row">
                <Calendar fullscreen={false} value={anniversaryDate} locale={zhLocale}/>
            </div>
            <div className="love-panel-row"><p className="love-large-text">我们已经在一起 {daysTogether} 天了！</p></div>
            <div className="love-panel-row"><p className="love-large-text">距离下一周年还有 {daysToNextAnniversary} 天！</p></div>
        </div>
    );
};

export default Anniversary;
