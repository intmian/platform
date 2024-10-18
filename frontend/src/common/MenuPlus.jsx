import {Layout, Menu} from "antd";
import {getItem} from "../tool.js";
import {useState} from "react";
import {useNavigate, useParams} from "react-router-dom";

const {Sider, Content} = Layout;

export function MenuPlus({disable, label2node, baseUrl}) {
    const {mode} = useParams();
    let mode2 = mode;
    let items = [];
    const navigate = useNavigate();
    if (mode2 === undefined) {
        mode2 = label2node.keys().next().value;
    }
    for (let [label] of label2node) {
        items.push(getItem(label, label));
    }
    const nowNode = label2node.get(mode2);
    const [collapsed, setCollapsed] = useState(false);

    return (
        <Layout>
            <Sider
                // width={200}
                // style={{
                //     background: '#fff',
                // }}
                collapsible
                style={{
                    minHeight: '100vh',
                }}
                collapsed={collapsed}
                onCollapse={(value) => setCollapsed(value)}
            >
                <Menu
                    disabled={disable}
                    mode="inline"
                    defaultSelectedKeys={[mode2]}
                    style={{
                        // 根据页面的总大小来设置高度
                        height: '100%',
                    }}
                    items={items}
                    onSelect={({key}) => {
                        navigate(baseUrl + key, {replace: true});
                    }}
                    theme="dark"
                />
            </Sider>
            <Content>
                {nowNode}
            </Content>
        </Layout>
    );
}