import {Layout, Menu} from "antd";
import {getItem} from "../tool.js";

const {Sider} = Layout;

function IndexSider({onUsrSelect}) {
    return (
        <Sider
            width={200}
            style={{
                background: '#fff',
            }}
        >
            <Menu
                mode="inline"
                defaultSelectedKeys={['monitor']}
                style={{
                    height: '100%',
                }}
                items={[
                    getItem('监控', 'monitor'),
                ]}
                onSelect={onUsrSelect}
            />
        </Sider>
    );
}

export default IndexSider;