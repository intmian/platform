import {Addr} from "./addr";
import {PTask, TaskType} from "./net/protocal";
import {Button, Checkbox, Dropdown, Flex, Tag} from "antd";
import {ReactNode} from "react";
import {
    BorderOutlined,
    CheckSquareOutlined,
    ClockCircleOutlined,
    FieldNumberOutlined,
    FieldTimeOutlined,
    MoreOutlined,
    SyncOutlined
} from "@ant-design/icons";
import {IsDateFromGoEmpty} from "../common/tool";

export interface TaskProps {
    onDelete: () => void
    subGroupAddr: Addr
    task: PTask
    onChangeFinish: (finish: boolean) => void
}

enum Status {
    // 以下状态为未开始 started == false
    WaitForTime,  // 等待一个开始时间，
    WaitForHandAfterTime, // 等待手动开始
    WaitForHand, // 什么条件都没有，只是等待手动开始
    // 以下状态为started == true
    StartedBegin,
    Running, // 进行中，持续进行 type == doing
    RunningUntilEnd, // 进行中，直到结束时间 type == doing && end_time为空时间或者为nil
    RunningAfterEnd, // 进行中，结束时间已经到了，需要手动完成下
    TODO, // type == todoType
    TODOUntilEnd, // type == todoType && end_time为空时间或者为nil
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
                status = Status.WaitForHand
            } else {
                status = Status.WaitForTime
            }
        } else {
            status = Status.WaitForHandAfterTime
        }
    }
    return status
}

function TaskStatusOperate({status, onClick}: { status: Status, onClick: () => void }) {
    switch (status) {
        case Status.WaitForTime:
            return <Button
                icon={<ClockCircleOutlined color='grey'/>}
                onClick={onClick}
            />
        case Status.WaitForHandAfterTime:
            return <Button
                icon={<FieldTimeOutlined color='grey'/>}
                onClick={onClick}
            />
        case Status.WaitForHand:
            return <Button
                icon={<FieldNumberOutlined color='grey'/>}
                onClick={onClick}
            />
        case Status.Running:
            return <Button
                icon={<SyncOutlined spin color='green'/>}
                onClick={onClick}
            />
        case Status.RunningUntilEnd:
            return <Button
                icon={<SyncOutlined spin color='yellow'/>}
                onClick={onClick}
            />
        case Status.RunningAfterEnd:
            return <Button
                icon={<SyncOutlined spin color='red'/>}
                onClick={onClick}
            />
        case Status.TODO:
            return <Button
                icon={<BorderOutlined color='blue'/>}
                onClick={onClick}
            />
        case Status.TODOUntilEnd:
            return <Button
                icon={<BorderOutlined color='yellow'/>}
                onClick={onClick}
            />
        case Status.TODOAfterEnd:
            return <Button
                icon={<BorderOutlined color='red'/>}
                onClick={onClick}
            />
        case Status.Finished:
            return <Button
                icon={<CheckSquareOutlined/>}
                onClick={onClick}
            />
        default:
            return null
    }
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

export function TaskTitle({task, clickShowSubTask}: { task: PTask, clickShowSubTask: () => void }) {
    return <>
        <div
            style={{
                flex: 1,
                // 如果任务完成了，显示划掉的线
                textDecoration: task.Done ? 'line-through' : 'none',
            }}
        >
            {task.Title}
        </div>
        {task.HaveSubTask ? <Button
            icon={<MoreOutlined/>}
            onClick={clickShowSubTask}
        /> : null}
    </>
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

export function Task(props: TaskProps) {
    // 这里的时间只做显示，不会真正的自动开始或者完成（目前）
    const status = GetTaskStatus(props.task)

    let line2: ReactNode
    const tags: ReactNode[] = []
    if (props.task.Tags) {
        for (const tag of props.task.Tags) {
            tags.push(<Tag key={tag} color="blue">{tag}</Tag>)
        }
    }
    const timeWait: ReactNode[] = []

    if (props.task.Wait4 !== "") {
        timeWait.push(<div>
            <Tag color="green">{props.task.Wait4}</Tag>
        </div>)
    }
    const now = new Date()
    if (now < props.task.BeginTime) {
        timeWait.push(<div>
            <Tag color="orange">

            </Tag>
        </div>)
    }

    return <div
        style={{
            width: '100%',
        }}
    >
        <Flex
            style={{
                width: '100%',
            }}
            align="center" justify="space-between"
            // 间隔
            gap={5}
        >
            <Checkbox
                checked={props.task.Done}
                onClick={
                    (e) => {
                        console.log('click', e)
                        props.onChangeFinish(!props.task.Done)
                    }
                }
            />
            <div
                style={{
                    flex: 1,
                    // 如果任务完成了，显示划掉的线
                    textDecoration: props.task.Done ? 'line-through' : 'none',
                }}
            >
                {props.task.Title}
            </div>
            <Dropdown
                menu={{
                    items: [
                        {
                            key: 'delete',
                            label: '删除',
                            onClick: () => {
                                props.onDelete()
                            },
                        },
                    ],
                }}>
                <MoreOutlined/>
            </Dropdown>
        </Flex>
        <div>
            {line2}
        </div>
    </div>
}