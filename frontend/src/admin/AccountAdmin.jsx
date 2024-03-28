import {Avatar, Card, List} from "antd";
import {UserOutlined} from "@ant-design/icons";
import {useState} from "react";
import VirtualList from 'rc-virtual-list';

function AccountPanel({name, initPermissions}) {
    const [permissions, setPermissions] = useState(initPermissions);
    return (
        <Card
            title={name}
            extra={
                <Avatar size={22} icon={<UserOutlined/>}/>
            }
        >
            <List>
                <VirtualList data={permissions} itemKey="permissions">
                    {(item: UserItem) => (
                        <List.Item key={item.email}>

                            <div>Content</div>
                        </List.Item>
                    )}
                </VirtualList>
            </List>
        </Card>
    );
}