import {Layout, Menu} from "antd";
import {getItem} from "../tool.js";
import {useState} from "react";

const {Sider, Content} = Layout;

export function MenuPlus({disable, label2node}) {
    let items = [];
    const defaultSelectedKeys = label2node.keys().next().value;
    for (let [label, node] of label2node) {
        items.push(getItem(label, label));
    }
    const [nowSelected, setNowSelected] = useState(defaultSelectedKeys);
    const nowNode = label2node.get(nowSelected);
    const [collapsed, setCollapsed] = useState(false);

    console.log(nowSelected);
    console.log(nowNode);

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
                    defaultSelectedKeys={['monitor']}
                    style={{
                        // 根据页面的总大小来设置高度
                        height: '100%',
                    }}
                    items={items}
                    onSelect={({key}) => {
                        setNowSelected(key);
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