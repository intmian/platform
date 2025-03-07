import {useEffect, useState} from "react";
import {PDir, PDirTree} from "./net/protocal";
import {Button, Form, Input, message, Modal, Popconfirm, Spin, Tooltip, Tree, TreeDataNode} from "antd";
import {
    CreateDirReq,
    CreateGroupReq,
    GetDirTreeReq,
    sendCreateDir,
    sendCreateGroup,
    sendGetDirTree
} from "./net/send_back";
import {CopyTwoTone, DeleteTwoTone, EditTwoTone, FileAddTwoTone, FileTextTwoTone} from "@ant-design/icons";
import {Addr} from "./addr";

function DirTreeNodeTitle({
                              title,
                              isDir,
                              note,
                              onClickAddChild,
                              onClickChange,
                              onClickDel,
                              addr
                          }: {
    title: string,
    isDir: boolean,
    note: string,
    onClickAddChild?: (dir: PDir) => void,
    onClickChange: () => void,
    onClickDel: () => void,
    addr: Addr,
}) {
    // 提取本层ID
    const dirID = addr.getLastUnit().ID;
    return <div>
        <Tooltip title={note}>
            {title}
        </Tooltip>
        {isDir && onClickAddChild ?
            <DirAddPanel onAddDir={onClickAddChild} userID={addr.userID} DirID={dirID}/> : null}
        <Button onClick={onClickChange} icon={<EditTwoTone/>}/>
        <Button onClick={
            () => {
                // 写到剪贴板
                navigator.clipboard.writeText(addr.toString()).then(() => {
                    message.success(`复制成功：${addr}`).then();
                });
            }
        } icon={<CopyTwoTone/>}/>
        <Popconfirm title={"确定要删除吗？"} onConfirm={onClickDel} okText={"确定"} cancelText={"取消"}>
            <Button icon={<DeleteTwoTone/>} danger/>
        </Popconfirm>
    </div>
}

function DirAddPanel({DirID, onAddDir, userID}: { onAddDir: (dir: PDir) => void, userID: string, DirID: number }) {
    const [startAdd, setStartAdd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    return <div>
        <Button onClick={() => {
            setStartAdd(true);
        }} icon={<FileAddTwoTone/>}/>
        {startAdd ? <Modal>
            <Form form={form}>
                <Form.Item label={"标题"} name={"title"}>
                    <Input/>
                </Form.Item>
                <Form.Item label={"备注"} name={"note"}>
                    <Input/>
                </Form.Item>
                <Form.Item label={"是否为任务组"} name={"isGroup"}>
                    <Input/>
                </Form.Item>
                <Form.Item>
                    <Button onClick={() => {
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
                                    const dir: PDir = {
                                        ID: ret.data.GroupID,
                                        Title: values.title,
                                        Note: values.note,
                                        Index: ret.data.Index,
                                    };
                                    onAddDir(dir);
                                    message.success("添加成功").then();
                                } else {
                                    message.error("添加失败").then();
                                }
                            });
                            setStartAdd(false);
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
                                        Index: 0,
                                    };
                                    onAddDir(dir);
                                    message.success("添加成功").then();
                                } else {
                                    message.error("添加失败").then();
                                }
                            })
                        }
                    }}
                            loading={loading}
                    >确定</Button>
                    <Button onClick={() => {
                        setStartAdd(false);
                    }}>取消</Button>
                </Form.Item>
            </Form>
        </Modal> : null}
    </div>
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
        ret.push(PDir2TreeDataNode(dir, addr, onRefresh));
    }
    for (const grp of pDir.ChildrenGrp) {
        const groupAddr = addr.copy();
        groupAddr.addGroup(grp.ID);
        ret.push({
            key: `grp-${grp.ID}`,
            icon: <FileTextTwoTone/>,
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
            onClickAddChild={(dir) => {
                // 修改pDir，然后刷新
                pDir.ChildrenDir.push({
                    RootDir: dir,
                    ChildrenDir: [],
                    ChildrenGrp: [],
                });
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
    if (loading) {
        return <Spin>Loading...</Spin>
    }

    // 显示树
    if (dirTree === null) {
        return <div>数据加载失败！</div>
    }
    const rootAddr = new Addr(userID);
    return <Tree
        treeData={[PDir2TreeDataNode(dirTree, rootAddr, () => {
            setDirTree(dirTree);
        })]}
        showLine={true}
        showIcon={true}
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