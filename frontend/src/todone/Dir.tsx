import {useEffect, useState} from "react";
import {PDir, PDirTree, PGroup} from "./net/protocal";
import {Dropdown, Form, Input, MenuProps, message, Modal, Space, Spin, Switch, Tooltip, Tree, TreeDataNode} from "antd";
import {
    CreateDirReq,
    CreateGroupReq,
    GetDirTreeReq,
    sendCreateDir,
    sendCreateGroup,
    sendGetDirTree
} from "./net/send_back";
import {
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    FileAddOutlined,
    FileOutlined,
    FolderOutlined
} from "@ant-design/icons";
import {Addr} from "./addr";

function DirTreeNodeTitle({
                              title,
                              isDir,
                              note,
                              onAddDir,
                              onAddGroup,
                              onClickChange,
                              onClickDel,
                              addr
                          }: {
    title: string,
    isDir: boolean,
    note: string,
    onAddDir?: (dir: PDir) => void,
    onAddGroup?: (group: PGroup) => void,
    onClickChange: () => void,
    onClickDel: () => void,
    addr: Addr,
}) {
    const [startAdd, setStartAdd] = useState(false);
    // 提取本层ID
    const dirID = addr.getLastUnit().ID;
    if (title === "") {
        title = "无标题";
    }
    const items: MenuProps['items'] = []
    if (isDir && onAddDir && onAddGroup) {
        items.push(
            {
                key: 'addDir',
                icon: <FileAddOutlined/>,
                label: "添加",
                onClick: () => {
                    setStartAdd(true);
                }
            }
        )
    }
    items.push(
        {
            key: 'change',
            icon: <EditOutlined/>,
            onClick: onClickChange,
            label: "修改"
        },
        {
            key: 'copy',
            onClick: () => {
                // 写到剪贴板
                navigator.clipboard.writeText(addr.toString()).then(() => {
                    message.success(`复制成功：${addr}`).then();
                });
            },
            icon: <CopyOutlined/>,
            label: "复制"
        },
        {
            key: 'del',
            onClick: onClickDel,
            icon: <DeleteOutlined/>,
            danger: true,
            label: "删除"
        }
    )

    return <Space>
        <Tooltip title={dirID + " " + note}>
            {isDir && onAddDir && onAddGroup ?
                <DirAddPanel
                    onAddDir={
                        (dir) => {
                            onAddDir(dir);
                            setStartAdd(false);
                        }
                    }
                    onAddGroup={
                        (group) => {
                            onAddGroup(group);
                            setStartAdd(false);
                        }
                    }
                    userID={addr.userID}
                    DirID={dirID}
                    startAdd={startAdd}
                    onCancel={() => {
                        setStartAdd(false)
                    }}/>
                : null}
            {isDir ? <FolderOutlined/> : <FileOutlined/>}
            {title}
        </Tooltip>
        <Dropdown menu={{items}}>
            ...
        </Dropdown>
    </Space>

}

function DirAddPanel({DirID, onAddDir, onAddGroup, onCancel, userID, startAdd,}: {
    onAddDir: (dir: PDir) => void,
    onAddGroup: (group: PGroup) => void,
    userID: string,
    DirID: number,
    startAdd: boolean,
    onCancel: () => void,
}) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    return <>
        {startAdd ? <Modal
            open={startAdd}
            onCancel={onCancel}
            okText={"添加"}
            closeIcon={null}
            confirmLoading={loading}
            cancelText={"取消"}
            onOk={() => {
                const values = form.getFieldsValue();
                if (values.title === undefined || values.note === undefined) {
                    return;
                }
                setLoading(true);
                if (values.isGroup) {
                    const req: CreateGroupReq = {
                        UserID: userID,
                        Title: values.title,
                        Note: values.note,
                        ParentDir: DirID,
                        AfterID: 0,
                    };
                    sendCreateGroup(req, (ret) => {
                        setLoading(false);
                        if (ret.ok) {
                            const group: PGroup = {
                                ID: ret.data.GroupID,
                                Title: values.title,
                                Note: values.note,
                                Index: ret.data.Index,
                            };
                            onAddGroup(group);
                            message.success("添加成功").then();
                        } else {
                            onCancel();
                            message.error("添加失败").then();
                        }
                    });
                    onCancel();
                } else {
                    const req: CreateDirReq = {
                        UserID: userID,
                        Title: values.title,
                        Note: values.note,
                        ParentDirID: DirID,
                        AfterID: 0,
                    };
                    sendCreateDir(req, (ret) => {
                        setLoading(false);
                        if (ret.ok) {
                            const dir: PDir = {
                                ID: ret.data.DirID,
                                Title: values.title,
                                Note: values.note,
                                Index: ret.data.Index,
                            };
                            onAddDir(dir);
                            message.success("添加成功").then();
                        } else {
                            message.error("添加失败").then();
                        }
                    })
                }
            }}
        >
            <Form form={form}>
                <Form.Item label={"标题"} name={"title"}
                           rules={[{required: true, message: "请输入标题"}]}
                >
                    <Input/>
                </Form.Item>
                <Form.Item label={"备注"} name={"note"}
                           rules={[{required: true, message: "请输入备注"}]}
                >
                    <Input/>
                </Form.Item>
                <Form.Item label={"是否为任务组"} name={"isGroup"}>
                    <Switch/>
                </Form.Item>
            </Form>
        </Modal> : null}
    </>
}

function PDir2TreeDataNode(pDir: PDirTree, addr: Addr, onRefresh: () => void): TreeDataNode {
    /*
    * 将PDirTree一层层展开，需要注意，对同一层级的group和dir需要进行排序。dir放在上面，group放在下面，根据Index排序。
    * */
    addr.addDir(pDir.RootDir.ID);
    // 排序本层级
    if (pDir.ChildrenDir === null) {
        pDir.ChildrenDir = [];
    }
    if (pDir.ChildrenGrp === null) {
        pDir.ChildrenGrp = [];
    }
    pDir.ChildrenDir = pDir.ChildrenDir.sort((a, b) => a.RootDir.Index - b.RootDir.Index);
    pDir.ChildrenGrp = pDir.ChildrenGrp.sort((a, b) => a.Index - b.Index);
    // 生成本层级
    const ret: TreeDataNode[] = [];
    for (const dir of pDir.ChildrenDir) {
        const dirAddr = addr.copy();
        ret.push(PDir2TreeDataNode(dir, dirAddr, onRefresh));
    }
    for (const grp of pDir.ChildrenGrp) {
        const groupAddr = addr.copy();
        groupAddr.addGroup(grp.ID);
        ret.push({
            key: `grp-${grp.ID}`,
            title: <DirTreeNodeTitle
                addr={groupAddr}
                isDir={false}
                title={grp.Title}
                note={grp.Note}
                onClickChange={() => {
                }}
                onClickDel={() => {
                }}
            />,
        });
    }
    return {
        key: `dir-${pDir.RootDir.ID}`,
        title: <DirTreeNodeTitle
            addr={addr}
            isDir={true}
            title={pDir.RootDir.Title}
            note={pDir.RootDir.Note}
            onAddDir={(dir) => {
                // 修改pDir，然后刷新
                pDir.ChildrenDir.push({
                    RootDir: dir,
                    ChildrenDir: [],
                    ChildrenGrp: [],
                });
                onRefresh();
            }}
            onAddGroup={(group) => {
                // 修改pDir，然后刷新
                pDir.ChildrenGrp.push(group);
                onRefresh();
            }}
            onClickChange={() => {
            }}
            onClickDel={() => {
            }}
        />,
        children: ret,
    };
}

export function Dir({userID, onSelectGroup}: { userID: string, onSelectGroup: (groupID: number) => void }) {
    // 状态
    const [dirTree, setDirTree] = useState<PDirTree | null>(null);
    const [loading, setLoading] = useState(true);

    // 加载数据
    useEffect(() => {
        const req: GetDirTreeReq = {UserID: userID};
        sendGetDirTree(req, (ret) => {
            if (ret.ok) {
                setDirTree(ret.data.DirTree);
            }
            setLoading(false);
        });
    }, [userID]);

    // 显示加载中
    if (loading || dirTree === null) {
        return <Spin>Loading...</Spin>
    }

    // 显示树
    const rootAddr = new Addr(userID);
    return <Tree
        treeData={[PDir2TreeDataNode(dirTree, rootAddr, () => {
            const newDirTree = {...dirTree};
            setDirTree(newDirTree);
        })]}
        onSelect={(selectedKeys) => {
            if (selectedKeys.length === 0) {
                return;
            }
            const key = selectedKeys[0];
            if (typeof key !== "string") {
                return;
            }
            const [type, id] = key.split("-");
            if (type === "grp") {
                onSelectGroup(parseInt(id));
            }
        }}
    />
}