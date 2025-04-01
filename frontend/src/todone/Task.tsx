import {Addr} from "./addr";
import {PTask, TaskType} from "./net/protocal";
import {Checkbox, Dropdown, Flex, Tag} from "antd";
import {ReactNode} from "react";
import {MoreOutlined} from "@ant-design/icons";

export interface TaskProps {
    onDelete: () => void
    subGroupAddr: Addr
    task: PTask
    onChangeFinish: (finish: boolean) => void
}

export function Task(props: TaskProps) {
    // 这里的时间只做显示，不会真正的自动开始或者完成（目前）
    enum Status {
        // 以下状态为未开始 started == false
        WaitForTime,  // 等待一个开始时间，
        WaitForHandAfterTime, // 等待手动开始
        WaitForHand, // 什么条件都没有，只是等待手动开始
        // 以下状态为started == true
        Running, // 进行中，持续进行 type == doing
        RunningUntilEnd, // 进行中，直到结束时间 type == doing && end_time为空时间或者为nil
        RunningAfterEnd, // 进行中，结束时间已经到了，需要手动完成下
        TODO, // type == todo
        TODOUntilEnd, // type == todo && end_time为空时间或者为nil
        TODOAfterEnd, // type == todo && end_time已经到了
        // 以下状态为完成
        Finished,
    }

    let status: Status
    if (props.task.Done) {
        status = Status.Finished
    } else if (props.task.Started) {
        const hasEndTime = props.task.EndTime && props.task.EndTime.getTime() > 0
        const AfterEnd = props.task.EndTime && props.task.EndTime.getTime() < new Date().getTime()
        if (!hasEndTime) {
            if (props.task.TaskType === TaskType.TODO) {
                status = Status.TODOUntilEnd
            } else {
                status = Status.RunningUntilEnd
            }
        } else {
            if (props.task.TaskType === TaskType.TODO) {
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
        const hasBeginTime = props.task.BeginTime && props.task.BeginTime.getTime() > 0
        const AfterBegin = props.task.BeginTime && props.task.BeginTime.getTime() < new Date().getTime()
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