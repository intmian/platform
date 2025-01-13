import {Layout, Menu} from "antd";
import {getItem} from "../tool.js";
import {useIsMobile} from "../common/hooksv2";

const {Sider} = Layout;

function IndexSider({onChooseMenuItem, disable}) {
    const isMobile = useIsMobile();
    return (
        <Sider
            width={isMobile ? 150 : 200}
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
                    getItem('后台数据', 'config'),
                    getItem('日志', 'log'),
                    getItem('账号', 'account'),
                    getItem('性能', 'performance'),
                ]}
                onSelect={onChooseMenuItem}
            />
        </Sider>
    );
}

export default IndexSider;