import {Avatar, Button, Card, Divider, List, Popconfirm} from "antd";
import {CloseOutlined, PlusOutlined, SaveOutlined, UserOutlined} from "@ant-design/icons";
import {useState} from "react";
import VirtualList from 'rc-virtual-list';
import TagInput from "../common/TagInput.jsx";
import {AllPermission} from "../common/def.js";

// AccountPanel 用于展示用户的权限信息，并管理密码对应的权限列表
export function AccountPanel({name, initPermissions}) {
    const [permissions, setPermissions] = useState(initPermissions);
    return (
        <Card
            style={{
                width: 400,
            }}
            title={name}
            extra={
                <>
                    <Avatar size={22} icon={<UserOutlined/>}/>
                    {/*新增权限*/}
                    <Button type="primary">
                        <PlusOutlined/>
                    </Button>
                    {/*删除用户*/}
                    <Popconfirm title={`确认删除用户${name}吗？`} okText="确认" cancelText="取消">
                        <Button type="primary">
                            <CloseOutlined/>
                        </Button>
                    </Popconfirm>
                </>
            }
        >
            <List>
                <VirtualList data={permissions} itemKey="permissions"
                             height={100} itemHeight={30}
                >
                    {(item) => (
                        <List.Item key={item.token}>
                            {/*最多显示10个字符，超过的用...代替，鼠标移上去显示完整内容*/}
                            <div
                                style={{width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}
                                title={item.token}>
                                {item.token}
                            </div>
                            <Divider type="vertical"/>
                            <TagInput tagOps={AllPermission} tags={item.permission}/>
                            <Divider type="vertical"/>
                            <Button type="primary">
                                <SaveOutlined/>
                            </Button>
                            <Button type="primary">
                                <CloseOutlined/>
                            </Button>
                        </List.Item>
                    )}
                </VirtualList>
            </List>
        </Card>
    );
}