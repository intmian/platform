import {Button, Card, Divider, List, Popconfirm, Space} from "antd";
import {CloseOutlined, PlusOutlined, SaveOutlined} from "@ant-design/icons";
import {useState} from "react";
import VirtualList from 'rc-virtual-list';
import TagInput from "../common/TagInput.jsx";
import {AllPermission} from "../common/def.js";

// AccountPanel 用于展示用户的权限信息，并管理密码对应的权限列表
// AccountPanel 负责显示相关

class PermissonShowData {
    tokenID = '';
    permission = [];
    saving = false;
    deleting = false;
}

class AccountPanelShowData {
    name = '';
    permissions = [];
    Adding = false;
    deleting = false;
}

export function AccountPanel({name, initPermissions, onDelete}) {
    let initShowData = new AccountPanelShowData();
    initShowData.name = name;
    for (let permission of initPermissions) {
        let data = new PermissonShowData();
        data.tokenID = permission.token;
        data.permission = permission.permission;
        initShowData.permissions.push(data);
    }
    const [showData, setShowData] = useState(initShowData);
    return (
        <Card
            // body padding 设为0
            style={{
                width: 410,
                // padding: 0,
            }}
            title={name}
            extra={<Space>
                <Button type="text" onClick={
                    () => {
                        // TODO: 发送
                    }
                }>
                    <PlusOutlined/>
                </Button>
                <Popconfirm title={`确认删除用户${name}吗？`} okText="确认" cancelText="取消" key="delete" onConfirm={
                    () => {
                        // TODO: 发送
                    }
                }>
                    <Button type="text" danger>
                        <CloseOutlined/>
                    </Button>
                </Popconfirm>
            </Space>}
            actions={[]}
        >
            <div>
                <List
                    // 10pxpadding 后 灰色边框
                    style={{
                        border: '1px solid #f0f0f0',
                        borderRadius: 4,
                        padding: 5,
                    }}
                >
                    <VirtualList data={permissions} itemKey="permissions"
                                 height={200} itemHeight={30}
                    >
                        {(item) => (
                            <List.Item key={item.token}>
                                {/*最多显示10个字符，超过的用...代替，鼠标移上去显示完整内容*/}
                                <div
                                    style={{
                                        width: 100,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                    title={item.token}>
                                    {item.token}
                                </div>
                                <Divider type="vertical"/>
                                <TagInput tagOps={AllPermission} tags={item.permission}/>
                                <Divider type="vertical"/>
                                <Space>
                                    <Button shape="circle" type="primary">
                                        <SaveOutlined/>
                                    </Button>
                                    <Popconfirm title={`确认删除权限吗？`} okText="确认" cancelText="取消"
                                                key="delete">
                                        <Button shape="circle" danger>
                                            <CloseOutlined/>
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            </List.Item>
                        )}
                    </VirtualList>
                </List>
            </div>
        </Card>
    )
        ;
}