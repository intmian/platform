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
                borderRadius: isMobile ? 0 : 8,
                overflow: 'hidden',
                padding: isMobile ? 0 : '8px 0',
                position: isMobile ? 'static' : 'sticky',
                top: 16,
            }}
        >
            <Menu
                disabled={disable}
                mode="inline"
                defaultSelectedKeys={['monitor']}
                style={{
                    borderInlineEnd: 'none',
                }}
                items={[
                    getItem('监控', 'monitor'),
                    getItem('后台数据', 'db'),
                    getItem('日志', 'log'),
                    getItem('账号', 'account'),
                    getItem('性能', 'performance'),
                    getItem('设置', 'setting'),
                    getItem('bi日志','bi')
                ]}
                onSelect={onChooseMenuItem}
            />
        </Sider>
    );
}

export default IndexSider;