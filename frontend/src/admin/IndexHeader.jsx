import {Button, Layout, Menu} from "antd";
import {getItem} from "../tool.js";

const {Header} = Layout;

function IndexHeader({user}) {
    let needLogin = false;
    if (user !== null && user !== "") {
        needLogin = true;
    }

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
                getItem('工具', 'tool'),
            ]
            }
            style={{
                flex: 1,
                minWidth: 0,
            }}
        />
        <Button type="primary">登陆</Button>
        <Button type="link" href="https://www.intmian.com">博客</Button>
    </Header>;
}

export default IndexHeader;