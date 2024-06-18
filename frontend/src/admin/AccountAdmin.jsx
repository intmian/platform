import {Button, Card, Col, Divider, Input, List, message, Modal, Popconfirm, Row, Space, Spin} from "antd";
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
                        if (ret.ok) {
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

function Permission({tokenID, iniPermission, onDelete}) {
    const [messageApi, contextHolder] = message.useMessage();
    const [permission, setPermission] = useState(iniPermission);
    const [needSave, setNeedSave] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteing, setDeleteing] = useState(false);
    return <Row
        style={{
            width: "100%",
        }}
    >
        {contextHolder}
        <Col
            span={4}
            style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}
        >
            {tokenID}
        </Col>
        <Col
            span={14}
        >
            <Divider type="vertical"/>
            <TagInput
                tagOps={AllPermission}
                tags={permission}
                onChange={
                    (value) => {
                        setPermission(value);
                        setNeedSave(true);
                    }}
                style={{
                    width: "90%",
                }}
                maxTagCount={'responsive'}
                maxTagTextLength={5}
                maxTagPlaceholder={(value) => {
                    return `选中${value.length}项`
                }}
            />
        </Col>
        <Col
            span={6}
        >
            <Space>
                <Divider type="vertical"/>
                <Button shape="circle" type="primary" disabled={!needSave || saving}
                        size={"small"}
                        loading={saving}
                        onClick={
                            () => {
                                setSaving(true);
                                sendChangeToken(name, tokenID, permission, (ret) => {
                                    if (ret.ok) {
                                        messageApi.success("保存成功");
                                        setNeedSave(false);
                                    } else {
                                        messageApi.error("保存失败");
                                    }
                                    setSaving(false);
                                })
                            }
                        }>
                    <SaveOutlined/>
                </Button>
                <Popconfirm title={`确认删除权限吗？`} okText="确认" cancelText="取消"
                            loading={deleteing}
                            key="delete"
                            onConfirm={
                                () => {
                                    setDeleteing(true);
                                    sendDelToken(name, tokenID, (ret) => {
                                        if (ret.ok) {
                                            messageApi.success("删除成功");
                                        } else {
                                            messageApi.error("删除失败");
                                        }
                                        setDeleteing(false);
                                        onDelete();
                                    })
                                }
                            }
                >
                    <Button shape="circle" danger loading={deleteing} size={"small"}>
                        <CloseOutlined/>
                    </Button>
                </Popconfirm>
            </Space>
        </Col>
    </Row>
}

function Permissions({permissionData}) {
    const [nowData, setNowData] = useState(permissionData);
    return <div>
        <List
            // 10pxpadding 后 灰色边框
            style={{
                // border: '1px solid #f0f0f0',
                // borderRadius: 4,
                // padding: 5,
            }}
        >
            <VirtualList data={nowData} itemKey="tokenID"
                         height={200} itemHeight={30}
            >
                {(item) => (
                    <List.Item key={item.tokenID}>
                        <Permission
                            tokenID={item.tokenID}
                            iniPermission={item.permission}
                            onDelete={
                                () => {
                                    setNowData(nowData.filter(
                                        (value) => {
                                            return value.tokenID !== item.tokenID;
                                        }
                                    ));
                                }
                            }
                        />
                    </List.Item>
                )}
            </VirtualList>
        </List>
    </div>
}

// AccountPanel 用于展示用户的权限信息，并管理密码对应的权限列表
export function AccountPanel({name, initShowData, onDelete}) {
    const [showData, setShowData] = useState(initShowData);
    const [messageApi, contextHolder] = message.useMessage();
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState(false);
    let addPermissionPanel = <AddPermissionPanel
        onAdd={
            (tokenID, permissions) => {
                showData.permissionData.push({
                    tokenID: tokenID,
                    permission: permissions,
                });
                setAdding(false);
            }}
        onCancel={
            () => {
                setAdding(false);
            }
        }
    />
    // 用户名右侧的操作空间，添加权限或者删除用户
    let opr = <Space>
        <Button type="text" onClick={
            () => {
                setAdding(true)
            }
        }>
            <PlusOutlined/>
        </Button>
        <Popconfirm title={`确认删除用户${name}吗？`} okText="确认" cancelText="取消" key="delete"
                    onConfirm={
                        () => {
                            setDeleting(true);
                            sendDeregister(name, (ret) => {
                                if (ret.data.code === 0) {
                                    messageApi.success("删除成功");
                                    onDelete(name);
                                } else {
                                    messageApi.error("删除失败");
                                }
                                setDeleting(false)
                            })
                        }
                    }>
            <Button type="text" danger loading={deleting}>
                <CloseOutlined/>
            </Button>
        </Popconfirm>
    </Space>

    return <>
        {contextHolder}
        {addPermissionPanel}
        <Card
            // body padding 设为0
            style={{
                width: 410,
                padding: 10,
            }}
            // 用户名
            title={name}
            extra={opr}
            actions={[]}
        >
            <div
            >
                <Permissions
                    permissionData={showData.permissionData}
                />
            </div>
        </Card>
    </>

}

// AccountAdmin 用于管理所有用户的权限信息
export function AccountAdmin() {
    const [data, setData] = useState([]);
    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(true);
    // 请求数据刷新
    useEffect(() => {
        let httpDatas = [];
        setLoading(true);
        sendGetAllAccount((ret) => {
            if (ret.ok) {
                httpDatas = ret.data;
                let temp = []
                for (let account in httpDatas.Accounts) {
                    temp.push(accountHttp2ShowData(httpDatas.Accounts[account], account));
                }
                setData(temp);
            } else {
                messageApi.error("获取用户数据失败");
            }
            setLoading(false);
        });
    }, []);

    if (loading) {
        return <div>
            <Spin/>
        </div>;
    }

    // 展示所有的用户
    let panels = null;
    if (data.length > 0) {
        panels = data.map((value) => {
            return <AccountPanel
                key={value.name}
                name={value.name}
                initShowData={value}
                onDelete={
                    (name) => {
                        let temp = data.filter(
                            (value) => {
                                return value.name !== name;
                            }
                        );
                        setData({...temp});
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