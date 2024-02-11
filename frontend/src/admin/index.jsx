import IndexHeader from "./IndexHeader.jsx";
import {Layout, theme} from "antd";
import IndexSider from "./IndexSider.jsx";
import IndexFooter from "./IndexFooter.jsx";
import IndexContent from "./IndexContent.jsx";
import {useState} from "react";


const {Content} = Layout;

function Index() {
    const [contentType, setContentType] = useState('monitor');
    const {
        token: {colorBgContainer, borderRadiusLG},
    } = theme.useToken();
    return <Layout>
        <IndexHeader/>
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
                    onUsrSelect={(item) => {
                        setContentType(item.key);
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