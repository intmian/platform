import {Addr} from "./addr";
import {PTask, TaskType} from "./net/protocal";
import {Button, Flex, Row, Tag} from "antd";
import {ReactNode, useState} from "react";
import {
    CaretRightOutlined,
    CheckOutlined,
    LoadingOutlined,
    MinusCircleOutlined,
    PlusCircleOutlined,
    RedoOutlined,
} from "@ant-design/icons";
import {IsDateFromGoEmpty} from "../common/tool";
import TaskTree, {TaskTreeNode} from "./TaskTree";
import {TaskList} from "./TaskList";
import {ChangeTaskReq, sendChangeTask} from "./net/send_back";

enum Status {
    // 以下状态为未开始 started == false
    WaitForTime,  // 等待一个开始时间，
    WaitForHandAfterTime, // 等待手动开始
    WaitForHand, // 什么条件都没有，只是等待手动开始
    // 以下状态为started == true
    StartedBegin,

    Running, // 进行中，持续进行 type == doing && end_time为空时间或者为nil
    RunningUntilEnd, // 进行中，直到结束时间 type == doing && 结束时间还没到
    RunningAfterEnd, // 进行中，结束时间已经到了，需要手动完成下
    TODO, // type == todoType && end_time为空时间或者为nil
    TODOUntilEnd, // type == todoType && end_time还没到
    TODOAfterEnd, // type == todoType && end_time已经到了
    // 以下状态为完成
    FinishedBegin,

    Finished,
}

function GetTaskStatus(task: PTask): Status {
    let status: Status
    if (task.Done) {
        status = Status.Finished
    } else if (task.Started) {
        const endTime = new Date(task.EndTime)
        const hasEndTime = task.EndTime && !(IsDateFromGoEmpty(task.EndTime))
        const AfterEnd = task.EndTime && endTime.getTime() < new Date().getTime()
        if (!hasEndTime) {
            if (task.TaskType === TaskType.TODO) {
                status = Status.TODOUntilEnd
            } else {
                status = Status.RunningUntilEnd
            }
        } else {
            if (task.TaskType === TaskType.TODO) {
                if (AfterEnd) {
                    status = Status.TODOAfterEnd
                } else {
                    status = Status.TODO
                }
            } else {
                if (AfterEnd) {
                    status = Status.RunningAfterEnd
                } else {
                    status = Status.Running
                }
            }
        }
    } else {
        const beginTime = new Date(task.BeginTime)
        const hasBeginTime = task.BeginTime && !(IsDateFromGoEmpty(task.BeginTime))
        const AfterBegin = task.BeginTime && beginTime.getTime() < new Date().getTime()
        if (hasBeginTime) {
            if (AfterBegin) {
                status = Status.WaitForHandAfterTime
            } else {
                status = Status.WaitForTime
            }
        } else {
            status = Status.WaitForHand
        }
    }
    return status
}

function TaskStatusOperate({status, onClick, operating}: { status: Status, onClick: () => void, operating: boolean }) {
    let icon: ReactNode = null
    let text: string | null = null
    if (status >= Status.StartedBegin && status < Status.FinishedBegin) {
        if (status >= Status.TODO) {
            icon = null
            if (!operating) {
                text = " "
            }
        } else {
            icon = <RedoOutlined/>
        }
    } else if (status >= Status.FinishedBegin) {
        // 已经结束
        icon = <CheckOutlined/>
    } else {
        // 没有开始情况
        icon = <CaretRightOutlined/>
    }
    if (operating) {
        icon = <LoadingOutlined spin={true}/>
    }
    return <Button
        icon={icon}
        onClick={onClick}
        style={{
            // 如果没有icon padding= 0
            padding: (icon) ? undefined : '0px',
            // 和文字一样高
            height: '22px',
            width: '22px',
        }}
    >
        {text}
    </Button>
}

export function TaskTags({task}: { task: PTask }) {
    const tags: ReactNode[] = []
    if (task.Tags) {
        for (const tag of task.Tags) {
            tags.push(<Tag key={tag} color="blue">{tag}</Tag>)
        }
    }
    return <>
        {tags}
    </>
}

interface TaskTitleProps {
    task: PTask
    clickShowSubTask: () => void
    isShowSon: boolean
}

export function TaskTitle({task, clickShowSubTask, isShowSon}: TaskTitleProps) {
    // 判断任务状态
    let color = undefined;
    let textDecoration = task.Done ? 'line-through' : 'none';
    if (!task.Started) {
        color = '#bfbfbf'; // 灰色
    }
    if (task.Done) {
        textDecoration = 'line-through';
    }
    return (
        <Flex
            style={{
                flex: 1,
            }}
        >
            <div
                style={{
                    flex: 1,
                    color,
                    textDecoration,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    width: '100px',
                    // 居中显示
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                {task.Title}
            </div>
            <Button
                size="small"
                type="text"
                onClick={clickShowSubTask}
                style={{marginLeft: 'auto'}}
                icon={!isShowSon ? <PlusCircleOutlined/> : <MinusCircleOutlined/>}
            >
            </Button>
        </Flex>
    )
}

export function TaskWaitAndTime({status, task}: { status: Status, task: PTask }) {
    // 有wait4就显示wait4，有time就显示time，没到开始时间显示为黄色，正在进行显示未绿色，超过时间显示为红色
    const timeWait: ReactNode[] = [];

    if (task.Wait4 !== "") {
        timeWait.push(
            <Tag color="green">{task.Wait4}</Tag>
        );
    }

    const now = new Date();
    const beginTime = new Date(task.BeginTime);
    const endTime = new Date(task.EndTime);

    if (status < Status.StartedBegin) {
        if (!IsDateFromGoEmpty(task.BeginTime)) {
            if (beginTime.getTime() > now.getTime()) {
                timeWait.push(
                    <Tag color="orange">
                        {task.BeginTime}
                    </Tag>
                );
            } else {
                timeWait.push(
                    <Tag color="green">
                        {task.BeginTime}
                    </Tag>
                );
            }
        }
    } else if (status < Status.FinishedBegin) {
        if (!IsDateFromGoEmpty(task.EndTime)) {
            if (endTime.getTime() < now.getTime()) {
                timeWait.push(
                    <Tag color="red">
                        {task.EndTime}
                    </Tag>
                );
            } else {
                timeWait.push(
                    <Tag color="green">
                        {task.EndTime}
                    </Tag>
                );
            }
        }
    }

    return <>{timeWait}</>;
}

export interface TaskProps {
    level: number
    task: PTask
    taskNode: TaskTreeNode
    addr: Addr
    indexSmallFirst: boolean
    loadingTree: boolean
    refreshTree: () => void
    tree: TaskTree
    onSelectTask: (addr: Addr, pTask: PTask, refreshApi: () => void) => void
}

export function Task(props: TaskProps) {
    // 这里的时间只做显示，不会真正的自动开始或者完成（目前）
    const status = GetTaskStatus(props.task)
    let hasSon: boolean = false;
    if (props.taskNode.children && props.taskNode.children.length > 0) {
        hasSon = true;
    }
    const [showSubTask, setShowSubTask] = useState(hasSon); // 是否显示子任务
    const [operate, setOperate] = useState(false); // 是否操作
    const thisAddr = props.addr.copy();
    thisAddr.addTask(props.task.ID);
    return <div
        style={{
            width: '100%',
        }}
    >
        <Row
            style={{
                columnGap: '10px',
                // 子组件居中
                alignItems: 'center',
            }}
            onClick={() => {
                props.onSelectTask(thisAddr, props.task, props.refreshTree);
            }}
        >
            <TaskStatusOperate
                operating={operate}
                onClick={
                    () => {
                        setOperate(true);
                        const ptask = props.tree.findTask(props.task.ID);
                        if (!ptask) {
                            return;
                        }
                        if (!ptask.task.Started) {
                            ptask.task.Started = true;
                        } else if (!ptask.task.Done) {
                            ptask.task.Done = true;
                        } else {
                            ptask.task.Done = false;
                            ptask.task.Started = false;
                        }
                        const req: ChangeTaskReq = {Data: ptask.task, UserID: props.addr.userID}
                        sendChangeTask(req, (ret) => {
                            if (ret.ok) {
                                props.refreshTree();
                            } else {
                                // 失败了
                                console.log("修改任务失败")
                            }
                            setOperate(false);
                        })
                    }
                } status={status}/>
            <TaskTitle
                task={props.task}
                clickShowSubTask={() => {
                    setShowSubTask(!showSubTask);
                }}
                isShowSon={showSubTask}
            />
        </Row>
        <Row>
            <TaskTags task={props.task}/>
            <TaskWaitAndTime status={status} task={props.task}/>
        </Row>
        {showSubTask && <Row>
            <TaskList
                addr={thisAddr}
                indexSmallFirst={props.indexSmallFirst}
                loadingTree={props.loadingTree}
                refreshTree={props.refreshTree}
                tree={props.tree}
                level={props.level}
                onSelectTask={props.onSelectTask}
            />
        </Row>
        }
    </div>
}