import {useCallback, useEffect, useRef, useState} from "react";
import {
    Button,
    Divider,
    Dropdown,
    Flex,
    Form,
    Input,
    InputRef,
    List,
    message,
    Modal,
    Skeleton,
    Space,
    Tooltip
} from "antd";
import {
    CreateSubGroupReq,
    CreateTaskReq,
    sendCreateSubGroup,
    sendCreateTask,
    sendDelSubGroup,
    sendGetTaskByPage
} from "./net/send_back";
import {Addr} from "./addr";
import {PSubGroup, PTask} from "./net/protocal";
import {
    CaretDownOutlined,
    CaretUpOutlined,
    CheckOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    LoadingOutlined,
    MoreOutlined
} from "@ant-design/icons";
import InfiniteScroll from "react-infinite-scroll-component";
import {Task} from "./Task";
import {lowLeverShadow} from "../css/shadow";
import TaskTree from "./TaskTree";

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

interface SubGroupProps {
    groupAddr: Addr
    subGroup: PSubGroup
    onDelete: (subGroup: PSubGroup) => void;
}

export function SubGroup(props: SubGroupProps) {
    const subGroupAddr = props.groupAddr.copy();
    subGroupAddr.addSubGroup(props.subGroup.ID);

    const [showTasks, setShowTasks] = useState(true); // 是否显示任务列表
    const [tasks, setTasks] = useState<PTask[]>([]); // 任务列表
    const pageRef = useRef(0); // 当前页码
    const tasksLast = useRef<PTask[]>([]); // 上次加载的任务列表
    const [hasMore, setHasMore] = useState(true); // 是否有更多数据
    const [containDone, setContainDone] = useState(false); // 是否包含已完成任务
    const [addingTask, setAddingTask] = useState(false); // 是否正在添加任务
    const PAGE_SIZE = 10; // 每页任务数量

    // tasks根据Index排序
    const [tree, setTree] = useState<TaskTree>(new TaskTree());
    tree.addTasks(tasks);

    // 加载任务数据
    const loadMoreData = useCallback(() => {
        const req = {
            UserID: props.groupAddr.userID,
            ParentDirID: props.groupAddr.getParentUnit().ID,
            GroupID: props.groupAddr.getLastUnit().ID,
            SubGroupID: props.subGroup.ID,
            Page: pageRef.current, // 发送当前页码
            PageNum: PAGE_SIZE,
            ContainDone: containDone,
        };
        sendGetTaskByPage(req, (ret) => {
            if (ret.ok) {
                const newTasks = ret.data.Tasks;
                if (!newTasks) {
                    setHasMore(false);
                    return
                }
                if (req.Page < pageRef.current) {
                    return; // 如果页码没有变化，直接返回，可能是内网的重复渲染的重复请求
                }
                tasksLast.current = tasksLast.current.concat(newTasks);
                const task2 = tasksLast.current
                setTasks(task2); // 合并新任务
                setHasMore(newTasks.length >= PAGE_SIZE); // 判断是否还有更多数据
                pageRef.current = req.Page + 1; // 页码加1
            } else {
                message.error("加载任务失败");
            }
        });
    }, [containDone, props.subGroup.ID]);

    // 如果筛选条件改变，重新加载数据
    useEffect(() => {
        setTasks([]); // 清空任务列表
        pageRef.current = 0; // 重置页码
        setHasMore(true); // 重置是否有更多数据
        loadMoreData(); // 加载第一页数据
    }, [containDone]);

    const [newTaskTitle, setNewTaskTitle] = useState(""); // 新任务标题
    const inputRef = useRef<InputRef | null>(null); // 输入框引用
    const CreateTask = useCallback((title: string) => {
        setAddingTask(true);
        const req: CreateTaskReq = {
            UserID: props.groupAddr.userID,
            DirID: props.groupAddr.getParentUnit().ID,
            GroupID: props.groupAddr.getLastUnit().ID,
            SubGroupID: props.subGroup.ID,
            ParentTask: 0,
            Title: title,
            Note: "",
            AfterID: 0,
        }
        sendCreateTask(req, (ret) => {
            setAddingTask(false);
            if (ret.ok) {
                const newTask = ret.data.Task;
                tasksLast.current = tasksLast.current.concat(newTask);
                const newTasks = tasksLast.current;
                setTasks(newTasks); // 合并新任务
                setNewTaskTitle(""); // 清空输入框
                inputRef.current?.blur(); // 失去焦点
            } else {
                message.error("添加任务失败");
            }
        })
    }, [])

    // 新增按钮
    const input = <Input variant={"filled"} placeholder="新增任务"
                         ref={inputRef}
                         value={newTaskTitle}
                         onChange={(e) => {
                             setNewTaskTitle(e.target.value);
                         }}
        // 离开输入框时，添加任务，或者按下回车键，并移除焦点清空
                         onBlur={() => {
                             if (!newTaskTitle) {
                                 return;
                             }
                             CreateTask(newTaskTitle);
                         }}
                         onPressEnter={() => {
                             if (!newTaskTitle) {
                                 return;
                             }
                             CreateTask(newTaskTitle);
                         }}
                         addonAfter={addingTask ? <LoadingOutlined spin/> : null}
    />

    // 渲染任务列表
    const skeParaNum = pageRef.current === 0 ? 10 : 1;
    const tasksList = <div id="scrollableDiv"
                           style={{
                               height: 400, overflow: "auto",
                               scrollbarWidth: 'none'
                               // border: "1px solid #ccc", padding: 10, margin: 10
                           }}>
        <InfiniteScroll
            dataLength={tasksShow.length}
            next={loadMoreData}
            hasMore={hasMore}
            loader={<Skeleton paragraph={{rows: skeParaNum}} active/>}
            endMessage={<Divider plain>没有更多🤐</Divider>}
            scrollableTarget="scrollableDiv"
        >
            {tasksShow.length === 0 ? <List
                    header={input}
                    dataSource={[]}
                    locale={{emptyText: ' '}}
                /> :
                <List
                    header={input}
                    dataSource={tasksShow}
                    renderItem={(item) => (
                        <List.Item key={item.ID}>
                            <Task
                                subGroupAddr={subGroupAddr}
                                task={item}
                                onDelete={function (): void {
                                    throw new Error("Function not implemented.");
                                }}
                            />
                        </List.Item>
                    )}
                />}
        </InfiniteScroll>
    </div>

    return <div
        style={{
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
                        setShowTasks(!showTasks);
                    }}
                            type="text"
                            icon={showTasks ? <CaretUpOutlined/> : <CaretDownOutlined/>}
                    />
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
        {showTasks ? tasksList : null}
    </div>
}