import {Button, Card, Divider, Input, List, message, Modal, Popconfirm, Row, Space, Spin} from "antd";
import {CloseOutlined, PlusOutlined, SaveOutlined} from "@ant-design/icons";
import {useEffect, useRef, useState} from "react";
import VirtualList from 'rc-virtual-list';
import TagInput from "../common/TagInput.jsx";
import {AllPermission} from "../common/def.js";
import {sendChangeToken, sendCreateToken, sendDelToken, sendDeregister, sendGetAllAccount} from "../common/sendhttp.js";
import {accountHttp2ShowData} from "./acoountdata.js";

// AddPermissionPanel 用于添加权限 onAdd为添加权限的回调 onCancel为取消添加权限的回调
export function AddPermissionPanel({account, onAdd, onCancel}) {
    // 密码、权限
    const [messageApi, contextHolder] = message.useMessage();
    const permissopns = useRef([]);
    const pwd = useRef("");
    const [loading, setLoading] = useState(false);
    return <>
        {contextHolder}
        <Modal
            open={true}
            closable={false}
            onCancel={onCancel}
            okButtonProps={{loading: loading}}
            onOk={
                () => {
                    setLoading(true);
                    sendCreateToken(account, pwd.current, permissopns.current, (ret) => {
                        if (ret.data.code === 0) {
                            // 成功，通知上层加入数据并关闭窗口
                            onAdd(ret.data.tokenID, permissopns.current);
                            messageApi.success("添加成功");
                        } else {
                            // 失败，提示错误
                            messageApi.error("添加失败");
                        }
                        setLoading(false);
                    });
                }
            }
            okText={"添加"}
            cancelText={"取消"}
        >
            <Space
                direction={"vertical"}
                size={"middle"}
                style={{
                    width: "100%",
                }}
            >
                <Row>
                    <Input.Password
                        placeholder="密码"
                        size={"middle"}

                        onChange={(e) => {
                            pwd.current = e.target.value;
                        }}/>
                </Row>
                <Row
                    style={{
                        width: "100%",
                    }}
                >
                    <TagInput
                        tagOps={AllPermission}
                        tags={[]}
                        style={{
                            width: "100%",
                        }}
                        onChange={
                            (value) => {
                                permissopns.current = value;
                            }}
                        tips={"选择权限"}
                    />
                </Row>
            </Space>
        </Modal>
    </>
}

// AccountPanel 用于展示用户的权限信息，并管理密码对应的权限列表
export function AccountPanel({name, initShowData, onDelete}) {
    const [showData, setShowData] = useState(initShowData);
    const [messageApi, contextHolder] = message.useMessage();
    return (
        <>
            {contextHolder}
            {showData.Adding && <AddPermissionPanel
                onAdd={
                    (tokenID, permissions) => {
                        showData.permissionData.push({
                            tokenID: tokenID,
                            permission: permissions,
                        });
                        showData.Adding = false;
                        setShowData({...showData});
                    }}
                onCancel={
                    () => {
                        showData.Adding = false;
                        setShowData({...showData});
                    }
                }
            />}
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
                            showData.Adding = true;
                            setShowData({...showData});
                        }
                    }>
                        <PlusOutlined/>
                    </Button>
                    <Popconfirm title={`确认删除用户${name}吗？`} okText="确认" cancelText="取消" key="delete"
                                onConfirm={
                                    () => {
                                        showData.deleting = true;
                                        setShowData({...showData});
                                        sendDeregister(name, (ret) => {
                                            if (ret.data.code === 0) {
                                                messageApi.success("删除成功");
                                                onDelete(name);
                                            } else {
                                                messageApi.error("删除失败");
                                            }
                                            showData.deleting = false;
                                            setShowData({...showData});
                                        })
                                    }
                                }>
                        <Button type="text" danger loading={showData.deleting}>
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
                        <VirtualList data={showData.permissionData} itemKey="permissions"
                                     height={200} itemHeight={30}
                        >
                            {(item) => (
                                <List.Item key={item.tokenID}>
                                    {/*最多显示10个字符，超过的用...代替，鼠标移上去显示完整内容*/}
                                    <div
                                        style={{
                                            width: 100,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}
                                        title={item.tokenID}>
                                        {item.tokenID}
                                    </div>
                                    <Divider type="vertical"/>
                                    <TagInput tagOps={AllPermission} tags={item.permission} onChange={
                                        (value) => {
                                            item.permission = value;
                                            item.needSave = true;
                                            setShowData({...showData});
                                        }
                                    }/>
                                    <Divider type="vertical"/>
                                    <Space>
                                        <Button shape="circle" type="primary" disabled={!item.needSave}
                                                loading={item.saving} onClick={
                                            () => {
                                                item.saving = true;
                                                setShowData({...showData});
                                                sendChangeToken(name, item.tokenID, item.permission, (ret) => {
                                                    if (ret.data.code === 0) {
                                                        messageApi.success("保存成功");
                                                        item.needSave = false;
                                                    } else {
                                                        messageApi.error("保存失败");
                                                    }
                                                    item.saving = false;
                                                    setShowData({...showData});
                                                })
                                            }
                                        }>
                                            <SaveOutlined/>
                                        </Button>
                                        <Popconfirm title={`确认删除权限吗？`} okText="确认" cancelText="取消"
                                                    loading={item.deleting}
                                                    key="delete"
                                                    onConfirm={
                                                        () => {
                                                            item.deleting = true;
                                                            setShowData({...showData});
                                                            sendDelToken(name, item.tokenID, (ret) => {
                                                                if (ret.data.code === 0) {
                                                                    messageApi.success("删除成功");
                                                                    showData.permissionData = showData.permissionData.filter(
                                                                        (value) => {
                                                                            return value.tokenID !== item.tokenID;
                                                                        }
                                                                    );
                                                                } else {
                                                                    messageApi.error("删除失败");
                                                                }
                                                                item.deleting = false;
                                                                setShowData({...showData});
                                                            })
                                                        }
                                                    }
                                        >
                                            <Button shape="circle" danger loading={item.deleting}>
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
        </>

    )
        ;
}

class AccountAdminData {
    accountData = [];
    lodding = true;
}

// AccountAdmin 用于管理所有用户的权限信息
export function AccountAdmin() {
    const [data, setData] = useState(new AccountAdminData());
    const [messageApi, contextHolder] = message.useMessage();

    // 请求数据刷新
    useEffect(() => {
        let httpDatas = [];
        sendGetAllAccount((ret) => {
            if (ret.data.code === 0) {
                httpDatas = ret.data.Accounts;
                for (let account in httpDatas) {
                    data.accountData.push(accountHttp2ShowData(httpDatas[account], account));
                }
            } else {
                messageApi.error("获取用户数据失败");
            }
            data.lodding = false;
            setData({...data});
        });
    }, []);

    if (data.lodding) {
        return <div>
            <Spin/>
        </div>;
    }

    // 展示所有的用户
    let panels = null;
    if (data.accountData.length > 0) {
        panels = data.accountData.map((value) => {
            return <AccountPanel
                key={value.name}
                name={value.name}
                initShowData={value}
                onDelete={
                    (name) => {
                        data.accountData = data.accountData.filter(
                            (value) => {
                                return value.name !== name;
                            }
                        );
                        setData({...data});
                    }
                }
            />
        });
    }

    return <>
        {contextHolder}
        <Space
            direction={"vertical"}
            size={"middle"}
            style={{
                width: "100%",
            }}
        >
            {panels}
        </Space>
    </>
}