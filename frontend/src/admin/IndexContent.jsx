import {Layout} from "antd";
import {useEffect, useState} from "react";
import ServicesData from "./servicesData.jsx";

const {Content} = Layout;

function Monitor() {
    const [data, setData] = useState('loading...');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch('/api/admin/services', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const result = await response.json();
                // 等待1秒后加载
                await new Promise((resolve) => {
                    setTimeout(resolve, 1000);
                });
                setData(result);
                console.log("http response:", result);
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        };

        fetchData();
    }, []); // 空的依赖项数组，确保只在组件挂载时执行

    return <ServicesData services={data}/>;
}

function Debug() {
    return <Content
        style={{
            padding: "0 48px",
        }}
    >
        content
    </Content>;
}

function IndexContent({contentType}) {
    return <Content
        style={{
            padding: "0 48px",
        }}
    >
        {contentType === 'monitor' ? Monitor() : null}
        {contentType === 'debug' ? Debug() : null}
    </Content>;
}

export default IndexContent;