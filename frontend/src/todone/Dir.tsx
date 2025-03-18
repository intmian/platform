import {useEffect, useState} from "react";
import {PDir, PDirTree, PGroup} from "./net/protocal";
import {
    Button,
    Dropdown,
    Form,
    Input,
    MenuProps,
    message,
    Modal,
    Space,
    Spin,
    Switch,
    Tooltip,
    Tree,
    TreeDataNode
} from "antd";
import {
    ChangeGroupReq,
    CreateDirReq,
    CreateGroupReq,
    GetDirTreeReq,
    MoveDirReq,
    MoveGroupReq,
    sendChangeDir,
    sendChangeGroup,
    sendCreateDir,
    sendCreateGroup,
    sendDelDir,
    sendDelGroup,
    sendGetDirTree,
    sendMoveDir,
    sendMoveGroup
} from "./net/send_back";
import {
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    FileAddOutlined,
    FileOutlined,
    FolderOutlined,
    LoadingOutlined,
    MoreOutlined
} from "@ant-design/icons";
import {Addr, AddrUnitType} from "./addr";

// 文件夹-任务组树的显示部分
function DirTreeNodeTitle({
                              title,
                              isDir,
                              note,
                              onAddDir,
                              onAddGroup,
                              onChange,
                              onDelSelf,
                              onMove,
                              addr
                          }: {
    title: string,
    isDir: boolean,
    note: string,
    onAddDir?: (dir: PDir) => void,
    onAddGroup?: (group: PGroup) => void,
    onChange: (title: string, note: string) => void,
    onMove: (parentDirID: number, newIndex: number) => void,
    onDelSelf: () => void,
    addr: Addr,
}) {
    const [startAdd, setStartAdd] = useState(false);
    const [startChange, setStartChange] = useState(false);
    const [operation, setOperation] = useState(false);
    // 提取本层ID
    const ID = addr.getLastUnit().ID;
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
            onClick: () => {
                setStartChange(true);
            },
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
            onClick: () => {
                setOperation(true);
                if (isDir) {
                    sendDelDir({UserID: addr.userID, DirID: ID}, (ret) => {
                        if (ret.ok) {
                            message.success("删除成功").then();
                            onDelSelf();
                        } else {
                            message.error("删除失败").then();
                        }
                        setOperation(false);
                    })
                } else {
                    const parentID = addr.getUnit(addr.getLength() - 2).ID;
                    sendDelGroup({UserID: addr.userID, ParentDir: parentID, GroupID: ID}, (ret) => {
                        if (ret.ok) {
                            message.success("删除成功").then();
                            onDelSelf();
                        } else {
                            message.error("删除失败").then();
                        }
                        setOperation(false);
                    })
                }
            }
            ,
            icon: <DeleteOutlined/>,
            danger: true,
            label: "删除"
        }
    )

    return <Tooltip title={note}>
        <Space size={2}>
            {startChange ? <DirChangePanel
                addr={addr}
                title={title}
                note={note}
                onCancel={function (): void {
                    setStartChange(false);
                }}
                onChange={function (title: string, note: string): void {
                    onChange(title, note);
                    setStartChange(false);
                }}
                onMove={onMove}
            /> : null}
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
                    DirID={ID}
                    startAdd={startAdd}
                    onCancel={() => {
                        setStartAdd(false)
                    }}/>
                : null}
            {isDir ? <FolderOutlined/> : <FileOutlined/>}
            {title}

            {operation ? <LoadingOutlined/> : null}
            <Dropdown menu={{items}}>
                <MoreOutlined/>
            </Dropdown>
        </Space>
    </Tooltip>

}

interface DirChangePanelProps {
    addr: Addr,
    title: string,
    note: string,
    onCancel: () => void,
    onChange: (title: string, note: string) => void,
    onMove: (parentDirID: number, newIndex: number) => void,
}

function DirChangePanel(props: DirChangePanelProps) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const isDir = props.addr.getLastUnit().Type === AddrUnitType.Dir;
    return <Modal
        title={props.addr.toString()}
        closeIcon={null}
        okText={"修改"}
        cancelText={"取消"}
        onCancel={props.onCancel}
        confirmLoading={loading}
        open={true}
        onOk={() => {
            const values = form.getFieldsValue();
            setLoading(true);
            if (isDir) {
                const req = {
                    UserID: props.addr.userID,
                    DirID: props.addr.getLastUnit().ID,
                    Title: values.title,
                    Note: values.note,
                }
                sendChangeDir(req, (ret) => {
                    setLoading(false);
                    if (ret.ok) {
                        props.onChange(values.title, values.note);
                        message.success("修改成功").then();
                    } else {
                        props.onCancel();
                        message.error("修改失败").then();
                    }
                })
            } else {
                const req: ChangeGroupReq = {
                    UserID: props.addr.userID,
                    ParentDirID: props.addr.getUnit(props.addr.getLength() - 2).ID,
                    GroupID: props.addr.getLastUnit().ID,
                    Title: values.title,
                    Note: values.note,
                }
                sendChangeGroup(req, (ret) => {
                    setLoading(false);
                    if (ret.ok) {
                        props.onChange(values.title, values.note);
                        message.success("修改成功").then();
                    } else {
                        props.onCancel();
                        message.error("修改失败").then();
                    }
                })
            }
        }}
    >
        <Form form={form}>
            <Form.Item label={"标题"} name={"title"} initialValue={props.title}>
                <Input/>
            </Form.Item>
            <Form.Item label={"备注"} name={"note"} initialValue={props.note}>
                <Input/>
            </Form.Item>
            <Space>
                <Form.Item label={"地址"} name={"newAddr"}>
                    <Input/>
                </Form.Item>
                <Form.Item>
                    <Button onClick={() => {
                        // 解析出目标dirID
                        const values = form.getFieldsValue();
                        const addr = new Addr(props.addr.userID);
                        addr.bindAddr(values.newAddr);
                        const trgDirID = addr.getParentUnit().ID
                        const afterID = addr.getLastUnit().ID;
                        if (trgDirID === 0 || afterID === 0 || addr.getParentUnit().Type !== AddrUnitType.Dir) {
                            message.error("地址错误").then();
                            return;
                        }
                        if (isDir) {
                            const req: MoveDirReq = {
                                UserID: props.addr.userID,
                                DirID: props.addr.getLastUnit().ID,
                                TrgDir: trgDirID,
                                AfterID: afterID,
                            }
                            sendMoveDir(req, (ret) => {
                                if (ret.ok) {
                                    message.success("移动成功").then();
                                    props.onMove(trgDirID, ret.data.Index);
                                } else {
                                    message.error("移动失败").then();
                                }
                            })
                        } else {
                            const req: MoveGroupReq = {
                                UserID: props.addr.userID,
                                GroupID: props.addr.getLastUnit().ID,
                                ParentDirID: props.addr.getParentUnit().ID,
                                TrgDir: trgDirID,
                                AfterID: afterID,
                            }
                            sendMoveGroup(req, (ret) => {
                                if (ret.ok) {
                                    message.success("移动成功").then();
                                    props.onMove(trgDirID, ret.data.Index);
                                } else {
                                    message.error("移动失败").then();
                                }
                            })
                        }
                    }}>移到之后</Button>
                </Form.Item>
                <Form.Item>
                    <Button onClick={() => {
                        const values = form.getFieldsValue();
                        // 从输入的地址解析出目标dirID
                        const addr = new Addr(props.addr.userID);
                        addr.bindAddr(values.newAddr);
                        const trgDirID = addr.getLastUnit().ID;
                        if (trgDirID === 0 || addr.getLastUnit().Type !== AddrUnitType.Dir) {
                            message.error("地址错误").then();
                            return;
                        }
                        if (isDir) {
                            const req: MoveDirReq = {
                                UserID: props.addr.userID,
                                DirID: props.addr.getLastUnit().ID,
                                TrgDir: trgDirID,
                                AfterID: 0,
                            }
                            sendMoveDir(req, (ret) => {
                                if (ret.ok) {
                                    message.success("移动成功").then();
                                    props.onMove(trgDirID, ret.data.Index);
                                } else {
                                    message.error("移动失败").then();
                                }
                            })
                        } else {
                            const req: MoveGroupReq = {
                                UserID: props.addr.userID,
                                GroupID: props.addr.getLastUnit().ID,
                                ParentDirID: addr.getUnit(addr.getLength() - 2).ID,
                                TrgDir: trgDirID,
                                AfterID: 0,
                            }
                            sendMoveGroup(req, (ret) => {
                                if (ret.ok) {
                                    message.success("移动成功").then();
                                    props.onMove(trgDirID, ret.data.Index);
                                } else {
                                    message.error("移动失败").then();
                                }
                            })
                        }
                    }}>移到之中</Button>
                </Form.Item>
            </Space>

        </Form>
    </Modal>
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
                if (values.title === undefined) {
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
                            onCancel();
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

function PDir2TreeDataNode(pDir: PDirTree, addr: Addr, onRefresh: () => void, onMove: (srcDir: PDir | null, srcGroup: PGroup | null, parentDirID: number) => void): TreeDataNode | null {
    /*
    * 将PDirTree一层层展开，需要注意，对同一层级的group和dir需要进行排序。dir放在上面，group放在下面，根据Index排序。
    * */
    if (pDir.Delete) {
        return null;
    }
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
        const NextNode = PDir2TreeDataNode(dir, dirAddr, onRefresh, onMove);
        if (NextNode !== null) {
            ret.push(NextNode);
        }
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
                onChange={(title: string, note: string) => {
                    grp.Title = title;
                    grp.Note = note;
                    onRefresh();
                }}
                onDelSelf={() => {
                    pDir.ChildrenGrp = pDir.ChildrenGrp.filter((value) => value.ID !== grp.ID);
                    onRefresh();
                }}
                onMove={(parentDirID: number, newIndex: number) => {
                    grp.Index = newIndex;
                    onMove(null, grp, parentDirID);
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
                    Delete: false,
                });
                onRefresh();
            }}
            onAddGroup={(group) => {
                // 修改pDir，然后刷新
                pDir.ChildrenGrp.push(group);
                onRefresh();
            }}
            onChange={(title: string, note: string) => {
                pDir.RootDir.Title = title;
                pDir.RootDir.Note = note;
                onRefresh();
            }}
            onDelSelf={() => {
                // 移除本dir并更新
                pDir.Delete = true;
                onRefresh();
            }}
            onMove={(parentDirID: number, newIndex: number) => {
                pDir.RootDir.Index = newIndex;
                onMove(pDir.RootDir, null, parentDirID);
            }}
        />,
        children: ret,
    };
}

interface DirProps {
    userID: string
    onSelectGroup: (groupAddr: Addr, title: string) => void
    onSelectDir: (dirAddr: Addr) => void
}

const LOCAL_STORAGE_KEY = "todone:dir:expandedKeys";

export function Dir(props: DirProps) {
    // 状态
    const [dirTree, setDirTree] = useState<PDirTree | null>(null);
    const [loading, setLoading] = useState(true);
    // 读取本地存储的展开状态
    const [expandedKeys, setExpandedKeys] = useState<string[]>(() => {
        const storedKeys = localStorage.getItem(LOCAL_STORAGE_KEY);
        return storedKeys ? JSON.parse(storedKeys) : [];
    });

    // 加载数据
    useEffect(() => {
        const req: GetDirTreeReq = {UserID: props.userID};
        sendGetDirTree(req, (ret) => {
            if (ret.ok) {
                setDirTree(ret.data.DirTree);
            }
            setLoading(false);
        });
    }, [props.userID]);

    // 显示加载中
    if (loading || dirTree === null) {
        return <Spin>Loading...</Spin>
    }

    // 显示树
    const rootAddr = new Addr(props.userID);
    const rootNode = PDir2TreeDataNode(dirTree, rootAddr, () => {
        const newDirTree = {...dirTree};
        setDirTree(newDirTree);
    }, (srcDir: PDir | null, srcGroup: PGroup | null, parentDirID: number) => {
        // 在dirtree中移动dir或group到parentDir，然后刷新

        // 删除树中原有的dir或group，递归搜索
        const delDirOrGroup = (tree: PDirTree) => {
            if (tree.RootDir.ID === srcDir?.ID) {
                tree.Delete = true;
                return true;
            }
            for (const dir of tree.ChildrenDir) {
                if (delDirOrGroup(dir)) {
                    return true;
                }
            }
            for (const group of tree.ChildrenGrp) {
                if (group.ID === srcGroup?.ID) {
                    tree.ChildrenGrp = tree.ChildrenGrp.filter((value) => value.ID !== group.ID);
                    return true;
                }
            }
            return false;
        }
        delDirOrGroup(dirTree);

        // 在目标dir中添加dir或group
        const addDirOrGroup = (tree: PDirTree) => {
            if (tree.RootDir.ID === parentDirID) {
                if (srcDir !== null) {
                    tree.ChildrenDir.push({
                        RootDir: srcDir,
                        ChildrenDir: [],
                        ChildrenGrp: [],
                        Delete: false,
                    });
                } else if (srcGroup !== null) {
                    tree.ChildrenGrp.push(srcGroup);
                }
                return true;
            }
            for (const dir of tree.ChildrenDir) {
                if (addDirOrGroup(dir)) {
                    return true;
                }
            }
            return false;
        }
        addDirOrGroup(dirTree);
        // 更新
        const newDirTree = {...dirTree};
        setDirTree(newDirTree);
    })
    if (rootNode === null) {
        return <Spin>Loading...</Spin>
    }
    return <Tree
        treeData={[rootNode]}
        expandedKeys={expandedKeys}
        onExpand={(keys) => {
            setExpandedKeys(keys as string[]);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(keys));
        }}
        // 用这个方法屏蔽掉选中后的选中状态，完全自己处理选中逻辑，同时避免双击才能重新选中以取消展开。
        selectedKeys={[]}
        // 隐藏前面的打开标记
        showLine={true}

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
                // 从tree中获取搜索到路径并组成Addr
                const addr = new Addr(props.userID);
                addr.addDir(dirTree.RootDir.ID);
                let title = "";
                const searchDir = (tree: PDirTree, addr: Addr): Addr | null => {
                    for (const grp of tree.ChildrenGrp) {
                        if (grp.ID === parseInt(id)) {
                            addr.addGroup(grp.ID);
                            title = grp.Title;
                            return addr;
                        }
                    }
                    for (const dir of tree.ChildrenDir) {
                        const addr2 = addr.copy();
                        addr2.addDir(dir.RootDir.ID);
                        const ret = searchDir(dir, addr2);
                        if (ret !== null) {
                            return ret;
                        }
                    }
                    return null;
                }
                const addrRet = searchDir(dirTree, addr);
                if (addrRet !== null) {
                    props.onSelectGroup(addrRet, title);
                }
            } else {
                // 从tree中获取搜索到路径并组成Addr
                const addr = new Addr(props.userID);
                addr.addDir(dirTree.RootDir.ID);
                const searchDir = (tree: PDirTree, addr: Addr): Addr | null => {
                    if (tree.RootDir.ID === parseInt(id)) {
                        return addr;
                    }
                    for (const dir of tree.ChildrenDir) {
                        const addr2 = addr.copy();
                        addr2.addDir(dir.RootDir.ID);
                        const ret = searchDir(dir, addr2);
                        if (ret !== null) {
                            return ret;
                        }
                    }
                    return null;
                }
                const addrRet = searchDir(dirTree, addr);
                if (addrRet !== null) {
                    props.onSelectDir(addrRet);
                }
                // 将文件夹展开，如果处于未展开状态
                if (!expandedKeys.includes(key)) {
                    const newExpandedKeys = [...expandedKeys];
                    newExpandedKeys.push(key);
                    setExpandedKeys(newExpandedKeys);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newExpandedKeys));
                } else {
                    // 如果已经展开，则收起
                    const newExpandedKeys = expandedKeys.filter((k) => k !== key);
                    setExpandedKeys(newExpandedKeys);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newExpandedKeys));
                }
            }
        }}
    />
}