import {useEffect, useRef, useState} from "react";
import {Button, Divider, Dropdown, Flex, Form, Input, message, Modal, Space, Tooltip} from "antd";
import {
    ChangeSubGroupReq,
    CreateSubGroupReq,
    GetTasksReq,
    sendChangeSubGroup,
    sendCreateSubGroup,
    sendDelSubGroup,
    sendGetTasks
} from "./net/send_back";
import {Addr} from "./addr";
import {PSubGroup, PTask} from "./net/protocal";
import {
    CaretDownOutlined,
    CaretUpOutlined,
    CheckOutlined,
    CheckSquareOutlined,
    CloseSquareOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    MoreOutlined,
    VerticalAlignBottomOutlined,
    VerticalAlignTopOutlined
} from "@ant-design/icons";
import {lowLeverShadow} from "../css/shadow";
import TaskTree from "./TaskTree";
import {TaskList} from "./TaskList";
import {useStateWithLocal} from "../common/hooksv2";
import {TaskMovePanel} from "./TaskDetail";

interface SubGroupAddPanelProps {
    userID: string
    dirID: number
    groupID: number
    onAdd: (sg: PSubGroup) => void
    onCancel: () => void
}

export function SubGroupAddPanel(props: SubGroupAddPanelProps) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    return <Modal
        open={true}
        title="添加分组"
        okText="添加"
        cancelText="取消"
        onCancel={props.onCancel}
        closeIcon={null}
        confirmLoading={loading}
        onOk={() => {
            setLoading(true);
            const values = form.getFieldsValue();
            const req: CreateSubGroupReq = {
                UserID: props.userID,
                ParentDirID: props.dirID,
                GroupID: props.groupID,
                Title: values.title,
                Note: values.note,
                AfterID: 0,
            }
            // 发送请求
            sendCreateSubGroup(req, (ret) => {
                if (ret.ok) {
                    message.success("添加分组成功").then();
                } else {
                    message.error("添加分组失败").then();
                }
                if (ret.ok) {
                    const sg = {
                        ID: ret.data.SubGroupID,
                        Title: values.title,
                        Note: values.note,
                        Index: ret.data.Index,
                    }
                    props.onAdd(sg);
                }
                setLoading(false);
            })
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
        </Form>
    </Modal>
}

// 新增：分组修改弹窗组件
interface SubGroupEditPanelProps {
    userID: string
    dirID: number
    groupID: number
    subGroupID: number
    data: PSubGroup
    onOk: (newTitle: string, newNote: string) => void
    onCancel: () => void
}

function SubGroupEditPanel(props: SubGroupEditPanelProps) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    return <Modal
        open={true}
        title="修改分组"
        okText="保存"
        cancelText="取消"
        onCancel={props.onCancel}
        closeIcon={null}
        confirmLoading={loading}
        onOk={() => {
            form.validateFields().then(values => {
                setLoading(true);
                const newData = props.data;
                newData.Title = values.title;
                newData.Note = values.note;
                const req: ChangeSubGroupReq = {
                    UserID: props.userID,
                    ParentDirID: props.dirID,
                    GroupID: props.groupID,
                    Data: newData,
                }
                // 发送请求
                sendChangeSubGroup(req, (ret) => {
                    if (ret.ok) {
                        message.success("修改分组成功").then();
                        props.onOk(values.title, values.note);
                    } else {
                        message.error("修改分组失败").then();
                    }
                    setLoading(false);
                })

            });
        }}
    >
        <Form form={form} initialValues={{title: props.data.Title, note: props.data.Note}}>
            <Form.Item label={"标题"} name={"title"} rules={[{required: true, message: "请输入标题"}]}>
                <Input/>
            </Form.Item>
            <Form.Item label={"备注"} name={"note"}>
                <Input/>
            </Form.Item>
        </Form>
    </Modal>
}

interface SubGroupProps {
    groupAddr: Addr
    subGroup: PSubGroup
    onDelete: (subGroup: PSubGroup) => void;
    onSelectTask: (addr: Addr, pTask: PTask, refreshApi: () => void, tree: TaskTree) => void;
}

export function SubGroup(props: SubGroupProps) {
    const subGroupAddr = props.groupAddr.copy();
    subGroupAddr.addSubGroup(props.subGroup.ID);

    const [open, setOpen] = useStateWithLocal("todone:subgroup:open:" + subGroupAddr.toString(), true); // 是否展开
    const [containDone, setContainDone] = useState(false); // 是否包含已完成任务
    const [indexSmallFirst, setIndexSmallFirst] = useStateWithLocal("todone:subgroup:indexsmallfirst:" + subGroupAddr.toString(), true); // 是否按Index升序排列
    const [loading, setLoading] = useState(false); // 是否正在加载数据
    const [editOpen, setEditOpen] = useState(false); // 是否显示修改弹窗

    const [selectMode, setSelectMode] = useState(false); // 是否选择模式
    const [selectModeMove, setSelectModeMove] = useState(false); // 是否选择模式移动
    const selectedRef = useRef<Set<number>>(new Set()); // 选中的任务ID集合

    // 目前先采用每个分组一个任务树的方式，方便移动等逻辑处理，一般来说加载出来的数据任务数量不会太多（不考虑已完成的情况下）,子任务也一起加载，跨分组移动可能会出现刷新问题，但是问题不大，不再采用懒加载。
    const [taskTree, setTaskTree] = useState<TaskTree>(new TaskTree()); // 任务树
    useEffect(() => {
        const req: GetTasksReq = {
            UserID: props.groupAddr.userID,
            ParentDirID: props.groupAddr.getParentUnit().ID,
            GroupID: props.groupAddr.getLastUnit().ID,
            SubGroupID: props.subGroup.ID,
            ContainDone: containDone,
        }
        setLoading(true);
        sendGetTasks(req, (ret) => {
            if (ret.ok) {
                taskTree.clear()
                if (ret.data.Tasks) {
                    const tasks = ret.data.Tasks;
                    taskTree.addTasks(tasks);
                }
                setTaskTree(taskTree.copy());
            } else {
                message.error("获取任务失败").then();
            }
            setLoading(false);
        })
    }, [containDone]);

    return <div
        style={{
            width: '100%',
            backgroundColor: 'white',
            padding: '5px',
            ...lowLeverShadow,
            marginBottom: '10px',
        }}
    >
        <Divider orientation="left" style={{
            margin: 0,
            borderBottom: '1px solid #ccc',
        }}>
            <Space>
                <Tooltip title={props.subGroup.Note} key={props.subGroup.ID}>
                    <div>{props.subGroup.Title}</div>
                </Tooltip>
                <Flex
                    // 居中
                    align={"center"}
                >
                    <Button onClick={() => {
                        setOpen(!open);
                    }}
                            size="small"
                            type="text"
                            icon={open ? <CaretUpOutlined/> : <CaretDownOutlined/>}
                    />
                    <Tooltip title={indexSmallFirst ? "按Index升序排列" : "按Index降序排列"}>
                        <Button
                            size="small"
                            type="text"
                            icon={indexSmallFirst ? <VerticalAlignBottomOutlined/> : < VerticalAlignTopOutlined/>}
                            onClick={() => {
                                setIndexSmallFirst(!indexSmallFirst);
                            }}
                        />
                    </Tooltip>
                    <Button
                        type="text"
                        size="small"
                        icon={selectMode ? <CloseSquareOutlined/> : <CheckSquareOutlined/>}
                        onClick={() => {
                            setSelectMode(!selectMode);
                        }}
                    />
                    {selectMode ?
                        <Button
                            type="text"
                            size="small"
                            onClick={() => {
                                setSelectModeMove(true);
                            }}
                        >移动</Button>
                        : null}
                    {
                        selectModeMove ? <TaskMovePanel
                            subGroupAddr={subGroupAddr}
                            movedTasks={Array.from(selectedRef.current)}

                            tree={taskTree}
                            onCancel={() => {
                                setSelectModeMove(false)
                            }}
                            onFinish={() => {
                                setSelectModeMove(false)
                                document.location.reload()
                            }}
                        /> : null
                    }
                    <Dropdown menu={{
                        items: [
                            {
                                key: 'containDone',
                                label: containDone ? '隐藏已完成' : '显示已完成',
                                icon: <CheckOutlined/>,
                                onClick: () => {
                                    setContainDone(!containDone);
                                }
                            },
                            {
                                key: 'copy',
                                icon: <CopyOutlined/>,
                                label: '复制路径',
                                onClick: () => {
                                    navigator.clipboard.writeText(subGroupAddr.toString()).then(() => {
                                        message.success("复制：" + subGroupAddr.toString()).then();
                                    })
                                }
                            },
                            {
                                key: 'change',
                                icon: <EditOutlined/>,
                                label: '修改分组',
                                onClick: () => {
                                    setEditOpen(true);
                                }
                            },
                            {
                                key: 'delete',
                                icon: <DeleteOutlined/>,
                                label: '删除分组',
                                danger: true,
                                onClick: () => {
                                    Modal.confirm({
                                        title: "删除分组",
                                        content: "确定删除分组吗？",
                                        okText: "删除",
                                        cancelText: "取消",
                                        onOk: () => {
                                            const req = {
                                                UserID: props.groupAddr.userID,
                                                ParentDirID: props.groupAddr.getParentUnit().ID,
                                                GroupID: props.groupAddr.getLastUnit().ID,
                                                SubGroupID: props.subGroup.ID,
                                            }
                                            sendDelSubGroup(req, (ret) => {
                                                if (ret.ok) {
                                                    message.success("删除分组成功").then();
                                                    props.onDelete(props.subGroup);
                                                } else {
                                                    message.error("删除分组失败").then();
                                                }
                                            })
                                            props.onDelete(props.subGroup);
                                        }
                                    })
                                }
                            }
                        ],
                    }}>
                        <MoreOutlined/>
                    </Dropdown>
                </Flex>
            </Space>
        </Divider>
        {/* 新增：分组修改弹窗 */}
        {editOpen &&
            <SubGroupEditPanel
                userID={props.groupAddr.userID}
                dirID={props.groupAddr.getParentUnit().ID}
                groupID={props.groupAddr.getLastUnit().ID}
                subGroupID={props.subGroup.ID}
                data={props.subGroup}
                onOk={(newTitle, newNote) => {
                    props.subGroup.Title = newTitle;
                    props.subGroup.Note = newNote;
                    setEditOpen(false);
                }}
                onCancel={() => setEditOpen(false)}
            />
        }
        {open ? <TaskList
            level={0}
            tree={taskTree}
            addr={subGroupAddr}
            indexSmallFirst={indexSmallFirst}
            loadingTree={loading}
            refreshTree={() => {
                setTaskTree(taskTree.copy());
            }}
            onSelectTask={props.onSelectTask}
            selectMode={selectMode}
            onSelModeSelect={(addr: Addr) => {
                if (selectedRef.current.has(addr.getLastUnit().ID)) {
                    selectedRef.current.delete(addr.getLastUnit().ID);
                } else {
                    selectedRef.current.add(addr.getLastUnit().ID);
                }
            }}
        /> : null}
    </div>
}