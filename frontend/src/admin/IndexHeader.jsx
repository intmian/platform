import {Button, Layout, Menu} from "antd";
import {getItem} from "../tool.js";

const {Header} = Layout;

function IndexHeader() {
    return <Header
        style={{
            display: 'flex',
            alignItems: 'center',
            // background: '#fff',
        }}
        theme={'dark'}
    >
        <Menu
            mode="horizontal"
            theme={'dark'}
            defaultSelectedKeys={['主页']}
            items={[
                getItem('主页', 'home'),
                getItem('笔记', 'note'),
            ]
            }
            style={{
                flex: 1,
                minWidth: 0,
            }}
        />
        <Button type="link" href="https://www.intmian.com">博客</Button>
    </Header>;
}

export default IndexHeader;