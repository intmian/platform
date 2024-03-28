import {Avatar, Card, Divider, List} from "antd";
import {UserOutlined} from "@ant-design/icons";
import {useState} from "react";
import VirtualList from 'rc-virtual-list';
import TagInput from "../common/TagInput.jsx";
import {AllPermission} from "../common/def.js";

// AccountPanel 用于展示用户的权限信息，并管理密码对应的权限列表
export function AccountPanel({name, initPermissions}) {
    const [permissions, setPermissions] = useState(initPermissions);
    return (
        <Card
            title={name}
            extra={
                <Avatar size={22} icon={<UserOutlined/>}/>
            }
        >
            <List>
                <VirtualList data={permissions} itemKey="permissions"
                             height={100} itemHeight={30}
                >
                    {(item) => (
                        <List.Item key={item.token}>
                            <div>{item.token}</div>
                            <Divider type="vertical"/>
                            <TagInput tagOps={AllPermission} tags={item.permission}/>
                        </List.Item>
                    )}
                </VirtualList>
            </List>
        </Card>
    );
}