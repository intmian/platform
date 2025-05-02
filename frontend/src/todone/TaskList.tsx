import TaskTree, {ExportTasks} from "./TaskTree";
import {Addr, AddrUnitType} from "./addr";
import {ReactNode, useEffect, useRef, useState} from "react";
import {PTask} from "./net/protocal";
import {Checkbox, Flex, Input, InputRef, List, message, Select, Tooltip} from "antd";
import {CreateTaskReq, sendCreateTask} from "./net/send_back";
import {LoadingOutlined} from "@ant-design/icons";
import {Task} from "./Task";

interface TaskCreateData {
    title: string;
    started: boolean;
    taskType: number; // 新增字段，表示任务类型
}

interface reqStatus {
    doing: boolean
    suc: boolean
}

const reqMap: Map<TaskCreateData, reqStatus> = new Map();

function Histories({reqs, addr, tree, isSubTask, smallFirst, refreshApi}: {
    reqs: TaskCreateData[]
    addr: Addr
    tree: TaskTree
    isSubTask: boolean
    smallFirst: boolean
    refreshApi: () => void
}) {
    const [flag, setFlag] = useState(false);

    useEffect(() => {
        let change = false;
        reqs.forEach((req) => {
            if (!reqMap.has(req)) {
                reqMap.set(req, {doing: false, suc: false});
                change = true;
            }
        })
        if (change) {
            setFlag(!flag);
        }
    }, [reqs, flag])

    useEffect(() => {
        // 发起请求
        for (const reqKey of reqs) {
            const req = reqKey;
            const status = reqMap.get(req);
            if (!status) {
                continue;
            }
            if (status.doing || status.suc) {
                continue;
            }
            reqMap.set(req, {doing: true, suc: false});
            const sendReq: CreateTaskReq = {
                UserID: addr.userID,
                DirID: addr.getLastDirID(),
                GroupID: addr.getLastGroupID(),
                SubGroupID: addr.getLastSubGroupID(),
                ParentTask: isSubTask ? addr.getLastUnit().ID : 0,
                Title: req.title,
                Note: "",
                AfterID: 0,
                Started: req.started,
                TaskType: req.taskType, // 传递任务类型
            }
            setFlag(false);
            sendCreateTask(sendReq, (ret) => {
                if (ret.ok) {
                    reqMap.set(req, {doing: false, suc: true});
                    tree.addTask(ret.data.Task)
                    refreshApi();
                } else {
                    message.error("添加任务失败").then();
                    reqMap.set(req, {doing: false, suc: false});
                }
                setFlag(!flag);
            })
        }
    }, [flag])

    // 渲染，仅渲染正在进行的
    const doings: ReactNode[] = [];
    console.log("render");
    console.log(reqMap);
    for (const req of reqs) {
        const status = reqMap.get(req);
        if (!status) {
            continue;
        }
        if (status.doing) {
            doings.push(
                <Flex align="center"
                      style={{
                          marginTop: smallFirst ? "0px" : "10px",
                          marginBottom: smallFirst ? "10px" : "0px",
                      }}
                      key={req}
                >
                    <Input
                        variant={"filled"}
                        value={req.title}
                        disabled={true}
                        addonAfter={<LoadingOutlined spin/>}
                    />
                </Flex>
            )
        }
    }

    if (!smallFirst) {
        doings.reverse();
    }

    return <div>
        {doings}
    </div>
}

export function TaskList({level, tree, addr, indexSmallFirst, loadingTree, refreshTree, onSelectTask}: {
    level: number
    tree: TaskTree
    addr: Addr
    indexSmallFirst: boolean
    loadingTree: boolean
    refreshTree: () => void
    onSelectTask: (addr: Addr, pTask: PTask, refreshApi: () => void) => void
}) {
    let taskShow: PTask[]
    // tasks根据Index排序
    if (addr.getLastUnit().Type == AddrUnitType.SubGroup) {
        taskShow = ExportTasks(tree.roots, indexSmallFirst);
    } else {
        const lastID = addr.getLastUnit().ID;
        const node = tree.findTask(lastID);
        if (!node) {
            taskShow = [];
        } else {
            // 任务树
            taskShow = ExportTasks(node.children, indexSmallFirst);
        }
    }

    const isSubTask: boolean = addr.getLastUnit().Type == AddrUnitType.Task
    const [newTaskTitle, setNewTaskTitle] = useState(""); // 新任务标题
    const inputRef = useRef<InputRef | null>(null); // 输入框引用
    const [reqs, setReqs] = useState<TaskCreateData[]>([]); // 请求列表
    // 新增输入框
    const [autoStart, setAutoStart] = useState(true); // 是否自动启动
    const [taskType, setTaskType] = useState(0); // 任务类型
    function onCreate() {
        const newReq: TaskCreateData = {
            title: newTaskTitle,
            started: autoStart,
            taskType: taskType, // 默认任务类型为 0
        };
        setReqs([...reqs, newReq]);
        setNewTaskTitle("");
    }

    const input = (
        <Flex align="center">
            <Input
                variant={"filled"}
                placeholder="新增任务,Ctrl+Enter 或 Command+Enter 添加"
                ref={inputRef}
                value={newTaskTitle}
                onChange={(e) => {
                    setNewTaskTitle(e.target.value);
                }}
                // 离开输入框时，添加任务，或者按下回车键，并移除焦点清空
                onBlur={() => {
                    if (newTaskTitle === "") {
                        return;
                    }
                    onCreate();
                }}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        if (newTaskTitle === "") {
                            return;
                        }
                        onCreate();
                    }
                }}
                addonAfter={<>
                    <Tooltip title="选择任务类型">
                        <Select
                            value={taskType}
                            onChange={
                                (value) => {
                                    setTaskType(value);
                                }
                            }
                            style={{marginRight: "1px"}}
                        >
                            <option value={0}>TODO</option>
                            <option value={1}>DOING</option>
                        </Select>
                    </Tooltip>
                    <Tooltip title="是否自动启动">
                        <Checkbox
                            checked={autoStart}
                            onChange={e => setAutoStart(e.target.checked)}
                        />
                    </Tooltip>
                </>}
                style={{flex: 1}}
            />
        </Flex>
    );
    const inputArea: ReactNode = indexSmallFirst ? <div>
        <Histories
            reqs={reqs}
            addr={addr}
            tree={tree}
            isSubTask={isSubTask}
            smallFirst={indexSmallFirst}
            refreshApi={refreshTree}
        />
        {input}
    </div> : <div>
        {input}
        <Histories
            reqs={reqs}
            addr={addr}
            tree={tree}
            isSubTask={isSubTask}
            smallFirst={indexSmallFirst}
            refreshApi={refreshTree}
        />
    </div>
    let show: ReactNode;
    if (loadingTree) {
        show = <List
            header={inputArea}
            // dataSource={taskShow}
            loading={loadingTree}
            locale={{emptyText: ' '}}
        />
    } else if (taskShow.length === 0) {
        show = <div
            style={{
                marginTop: "10px",
            }}
        >
            {inputArea}
        </div>
    } else {
        show = <List
            // loading={loadingTree}
            header={indexSmallFirst ? null : inputArea}
            footer={indexSmallFirst ? inputArea : null}
            dataSource={taskShow}
            renderItem={(item) => (
                <List.Item key={item.ID}>
                    <Task
                        onSelectTask={onSelectTask}
                        level={level + 1}
                        addr={addr.copy()}
                        task={item}
                        taskNode={tree.findTask(item.ID)!}
                        indexSmallFirst={indexSmallFirst}
                        loadingTree={loadingTree}
                        refreshTree={refreshTree}
                        tree={tree}
                    />
                </List.Item>
            )}
        />
    }

    return <div
        id="scrollableDiv"
        style={{
            paddingLeft: `${level * 24}px`,
            width: '100%',
        }}
    >
        {show}
    </div>
}