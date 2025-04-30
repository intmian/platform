import TaskTree, {ExportTasks} from "./TaskTree";
import {Addr, AddrUnitType} from "./addr";
import {ReactNode, useCallback, useRef, useState} from "react";
import {PTask} from "./net/protocal";
import {Checkbox, Flex, Input, InputRef, List, message, Tooltip} from "antd";
import {CreateTaskReq, sendCreateTask} from "./net/send_back";
import {LoadingOutlined} from "@ant-design/icons";
import {Task} from "./Task";

export function TaskList({level, tree, addr, indexSmallFirst, loadingTree, refreshTree, onSelectTask}: {
    level: number
    tree: TaskTree
    addr: Addr
    indexSmallFirst: boolean
    loadingTree: boolean
    refreshTree: () => void
    onSelectTask: (addr: Addr, pTask: PTask, refreshApi: () => void) => void
}) {
    const [addingTask, setAddingTask] = useState(false); // 是否正在添加任务

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
    const CreateTask = useCallback((title: string, started: boolean) => {
        setAddingTask(true);
        const req: CreateTaskReq = {
            UserID: addr.userID,
            DirID: addr.getLastDirID(),
            GroupID: addr.getLastGroupID(),
            SubGroupID: addr.getLastSubGroupID(),
            ParentTask: isSubTask ? addr.getLastUnit().ID : 0,
            Title: title,
            Note: "",
            AfterID: 0,
            Started: started,
        }
        sendCreateTask(req, (ret) => {
            setAddingTask(false);
            if (ret.ok) {
                const newTask = ret.data.Task;
                tree.addTask(newTask);
                refreshTree();
                setNewTaskTitle(""); // 清空输入框
                inputRef.current?.blur(); // 失去焦点
            } else {
                message.error("添加任务失败");
            }
        })
    }, [tree, addr, indexSmallFirst])

    // 新增输入框
    const [autoStart, setAutoStart] = useState(true); // 是否自动启动
    const input = (
        <Flex align="center">
            <Input
                variant={"filled"}
                placeholder="新增任务,回车或者离开输入框添加"
                ref={inputRef}
                value={newTaskTitle}
                onChange={(e) => {
                    setNewTaskTitle(e.target.value);
                }}
                // 离开输入框时，添加任务，或者按下回车键，并移除焦点清空
                onBlur={() => {
                    if (!newTaskTitle || addingTask) {
                        return;
                    }
                    CreateTask(newTaskTitle, autoStart);
                }}
                onPressEnter={() => {
                    if (!newTaskTitle || addingTask) {
                        return;
                    }
                    CreateTask(newTaskTitle, autoStart);
                }}
                addonAfter={addingTask ? <LoadingOutlined spin/> : <Tooltip title="是否自动启动">
                    <Checkbox
                        checked={autoStart}
                        onChange={e => setAutoStart(e.target.checked)}
                    />
                </Tooltip>}
                style={{flex: 1}}
            />
        </Flex>
    );

    let show: ReactNode;
    if (loadingTree) {
        show = <List
            header={input}
            dataSource={taskShow}
            loading={loadingTree}
            locale={{emptyText: ' '}}
        />
    } else if (taskShow.length === 0) {
        show = <div
            style={{
                marginTop: "10px",
            }}
        >
            {input}
        </div>
    } else {
        show = <List
            loading={loadingTree}
            header={indexSmallFirst ? null : input}
            footer={indexSmallFirst ? input : null}
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