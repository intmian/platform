import IndexHeader from "./IndexHeader.jsx";
import {Layout, message, theme} from "antd";
import IndexSider from "./IndexSider.jsx";
import IndexFooter from "./IndexFooter.jsx";
import IndexContent from "./IndexContent.jsx";
import React, {useEffect, useState} from "react";
import {SendCheckLogin} from "../common/sendhttp.js";


const {Content} = Layout;

function Index() {
    const [contentType, setContentType] = useState('monitor');
    const {
        token: {colorBgContainer, borderRadiusLG},
    } = theme.useToken();
    const [usr, setUsr] = useState(null);
    useEffect(() => {
        SendCheckLogin((data) => {
            if (data === null) {
                message.error("api错误，请重试或联系开发者");
            }
            setUsr(data);
        })
    }, []);

    return <Layout>
        <IndexHeader
            user={usr}
            onLogOut={() => {
                setUsr(null);
                message.success("登出成功");
            }}
            onLoginSuc={(user) => {
                setUsr(user.username);
                message.success("登陆成功");
            }}
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
                    disable={usr === null || usr === ""}
                    onChooseMenuItem={(item) => {
                        setContentType(item.key);
                    }}
                />
                {
                    // 未登录时显示登录提示
                    usr === null || usr === "" ? <IndexContent
                            contentType={'needLogin'}
                        />
                        : <IndexContent
                            contentType={contentType}
                        />
                }
            </Layout>
        </Content>
        <IndexFooter/>
    </Layout>
}

export default Index;