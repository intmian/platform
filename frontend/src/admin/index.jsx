import IndexHeader from "./IndexHeader.jsx";
import {Layout, theme} from "antd";
import IndexSider from "./IndexSider.jsx";
import IndexFooter from "./IndexFooter.jsx";
import IndexContent from "./IndexContent.jsx";
import React, {useEffect, useState} from "react";


const {Content} = Layout;

function CheckLogin() {
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

function Index() {
    const [contentType, setContentType] = useState('monitor');
    const {
        token: {colorBgContainer, borderRadiusLG},
    } = theme.useToken();
    let usr = ""
    const [loginUser, setLoginUser] = useState(null);
    useEffect(() => {
        usr = CheckLogin();
    }, []);

    return <Layout>
        <IndexHeader
            user={usr}
        />
        <Content
            style={{
                padding: '0 48px',
            }}
        >
            <div
                style={
                    {
                        height: '16px',
                    }
                }
            />
            <Layout
                style={{
                    padding: '24px 0',
                    background: colorBgContainer,
                    borderRadius: borderRadiusLG,
                    minHeight: '80vh'
                }}
            >
                <IndexSider
                    onChooseMenuItem={(item) => {
                        setContentType(item.key);
                        console.log("selected item:", item.key);
                    }}
                />
                <IndexContent
                    contentType={contentType}
                />
            </Layout>
        </Content>
        <IndexFooter/>
    </Layout>
}

export default Index;