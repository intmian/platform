import {Layout, Menu} from "antd";
import {getItem} from "../tool.js";

const {Sider} = Layout;

function IndexSider({onChooseMenuItem, disable}) {
    return (
        <Sider
            width={200}
            style={{
                background: '#fff',
            }}
        >
            <Menu
                disabled={disable}
                mode="inline"
                defaultSelectedKeys={['monitor']}
                style={{
                    height: '100%',
                }}
                items={[
                    getItem('监控', 'monitor'),
                    getItem('全局配置', 'config'),
                    getItem('日志', 'log'),
                    // getItem('debug', 'debug'),
                ]}
                onSelect={onChooseMenuItem}
            />
        </Sider>
    );
}

export default IndexSider;