import {useEffect, useState} from 'react';
import {Image, Space, Typography} from 'antd';
import catPic from '../assets/cat.jpg';
import './ErrorPage.css'; // 引入样式文件
const {Text, Link, Title} = Typography;

const errStr = '或者确实有问题：可能是有bug，可能是有人搞事情，也可能是我单纯没想到'

const texts = [
    <Text key={1}>{errStr}</Text>,
    <Text type="secondary" key={1}>{errStr}</Text>,
    <Text type="success" key={2}>{errStr}</Text>,
    <Text type="warning" key={3}>{errStr}</Text>,
    <Text type="danger" key={4}>{errStr}</Text>,
    <Text disabled key={5}> {errStr}</Text>,
    <Text mark key={6}>{errStr}</Text>,
    <Text code key={7}>{errStr}</Text>,
    <Text keyboard key={8}>{errStr}</Text>,
    <Text underline key={9}>{errStr}</Text>,
    <Text delete key={10}>{errStr}</Text>,
    <Text strong key={11}>{errStr}</Text>,
    <Text italic key={12}>{errStr}</Text>,
    <Link href="https://www.intmian.com" target="_blank" key={13}>
        {errStr}
    </Link>
];

export function ErrorPage() {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % texts.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const currentText = texts[currentIndex];

    return (
        <div className="error-page">
            <Space direction="vertical" align="center">
                <Space direction="vertical">
                    <Title>Not Found,这个页面被猫吃了</Title>
                    <Image width={'40%'} src={catPic}/>
                    <div className="text-box">
                        {currentText}
                    </div>
                </Space>
            </Space>
        </div>
    );
}