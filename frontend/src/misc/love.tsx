import React, {useEffect, useState} from 'react';
import {Calendar} from 'antd';
import styled, {keyframes} from 'styled-components';
import dayjs, {Dayjs} from 'dayjs';
import zhLocale from 'antd/lib/calendar/locale/zh_CN.js'

// 爱心飘动动画
const floatAnimation = keyframes`
    0% {
        transform: translateY(0) scale(1);
    }
    50% {
        transform: translateY(-20px) scale(1.2);
    }
    100% {
        transform: translateY(0) scale(1);
    }
`;

// 漂浮爱心
interface FloatingHeartProps {
    top: string;
    left: string;
    duration: number;
}

const FloatingHeart = styled.div<FloatingHeartProps>`
    position: absolute;
    font-size: 24px;
    animation: ${floatAnimation} ${(props) => props.duration}s ease-in-out infinite;
    color: #eb2f96;
    top: ${(props) => props.top};
    left: ${(props) => props.left};
`;

// 中间巨大爱心
const CenterHeart = styled.div`
    font-size: 128px;
    color: #eb2f96;
`;

// 大字显示
const LargeText = styled.p`
    font-size: 24px;
    margin-top: 2px;
`;

const Anniversary: React.FC = () => {

    // 随机生成位置和持续时间的爱心
    const floatingHearts = Array.from({length: 50}).map((_, index) => (
        <FloatingHeart
            key={index}
            top={`${Math.random() * 100}%`}
            left={`${Math.random() * 100}%`}
            duration={Math.random() * 3 + 2} // 2 到 5 秒的随机动画时间
        >
            💖
        </FloatingHeart>
    ));

    return <div
        style={{
            //     粉红色背景
            backgroundColor: '#f9f0ff',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',  // 父容器占满整个屏幕高度
        }}
    >
        {floatingHearts}
        <LovePanel/>
    </div>;
};

const LovePanel = () => {
    const [daysTogether, setDaysTogether] = useState<number>(0);
    const [daysToNextAnniversary, setDaysToNextAnniversary] = useState<number>(0);

    const anniversaryDate: Dayjs = dayjs('2022-12-18');

    useEffect(() => {
        const today: Dayjs = dayjs();
        const diffDays: number = today.diff(anniversaryDate, 'day');
        setDaysTogether(diffDays);

        const nextAnniversary: Dayjs = anniversaryDate.add(Math.floor(diffDays / 365) + 1, 'year');
        const daysUntilNext: number = nextAnniversary.diff(today, 'day');
        setDaysToNextAnniversary(daysUntilNext);
    }, []);

    const parentStyle = {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px',
        maxHeight: '100%',
        minWidth: '300px',
        width: '300px',
        flexDirection: 'column', // 垂直排列子组件
        zIndex: 1, // 确保爱心飘动在最上层
    };

    const childStyle = {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        textAlign: 'center' // 确保文本居中
    };

    return (
        <div style={parentStyle}>
            <div style={childStyle}><CenterHeart>❤️</CenterHeart></div>
            <div style={childStyle}><LargeText>爱你宝宝</LargeText></div>
            <div style={childStyle}><Calendar fullscreen={false} defaultValue={anniversaryDate} locale={zhLocale}
                                              disabledDate={(date) => {
                                                  // 只能选择纪念日
                                                  return date.format('YYYY-MM-DD') !== anniversaryDate.format('YYYY-MM-DD');
                                              }}
            />
            </div>
            <div style={childStyle}><LargeText>我们已经在一起 {daysTogether} 天了！</LargeText></div>
            <div style={childStyle}><LargeText>距离下一周年还有 {daysToNextAnniversary} 天！</LargeText></div>
        </div>
    );
}


export default Anniversary;