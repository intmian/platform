import {Addr} from "./addr";
import {PTask} from "./net/protocal";
import {Button, DatePicker, Flex, Input, message, Select, Typography} from "antd";
import {useEffect, useState} from "react";
import dayjs from "dayjs";
import {EmptyGoTimeStr, IsDateEmptyFromGoEmpty} from "../common/tool";
import {ChangeTaskReq, sendChangeTask} from "./net/send_back";
import {SaveOutlined} from "@ant-design/icons";

interface TaskDetailProps {
    addr?: Addr
    task?: PTask
    refreshApi?: () => void
}

export function TaskDetail(props: TaskDetailProps) {
    const [title, setTitle] = useState("");
    const [note, setNote] = useState("");
    const [beginTime, setBeginTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [wait4, setWait4] = useState("");
    const [taskType, setTaskType] = useState<number>(0);
    const [status, setStatus] = useState<"not_started" | "started" | "done">("not_started");

    useEffect(() => {
        if (!props.task) {
            return;
        }
        setTitle(props.task.Title);
        setNote(props.task.Note);
        setBeginTime(props.task.BeginTime);
        setEndTime(props.task.EndTime);
        setWait4(props.task.Wait4);
        setTaskType(props.task.TaskType ?? 0);
        if (props.task.Done) {
            setStatus("done");
        } else if (props.task.Started) {
            setStatus("started");
        } else {
            setStatus("not_started");
        }
    }, [props.task]);
    const [editing, setEditing] = useState(false);
    if (props.addr == undefined || props.task == undefined || props.refreshApi == undefined) {
        return <div>

        </div>
    }
    let needSave = false;
    if (title !== props.task.Title) {
        needSave = true;
    }
    if (note !== props.task.Note) {
        needSave = true;
    }
    if (beginTime !== props.task.BeginTime) {
        console.log("beginTime", beginTime, props.task.BeginTime);
        needSave = true;
    }
    if (endTime !== props.task.EndTime) {
        needSave = true;
    }
    if (wait4 !== props.task.Wait4) {
        needSave = true;
    }
    if (taskType !== (props.task.TaskType ?? 0)) {
        needSave = true;
    }
    let taskStatus: "not_started" | "started" | "done";
    if (props.task.Done) {
        taskStatus = "done";
    } else if (props.task.Started) {
        taskStatus = "started";
    } else {
        taskStatus = "not_started";
    }
    if (status !== taskStatus) {
        needSave = true;
    }

    let beginTimeJs;
    let endTimeJs;
    if (!IsDateEmptyFromGoEmpty(beginTime)) {
        beginTimeJs = dayjs(beginTime);
    }
    if (!IsDateEmptyFromGoEmpty(endTime)) {
        endTimeJs = dayjs(endTime);
    }

    const task = props.task;
    const addr = props.addr.copy();

    return <Flex
        vertical={true}
        style={{
            height: "100%",
            // padding: 10,
        }}
        gap={10}
    >
        <Flex>
            <div style={{
                width: "50%",
                marginRight: "10px",
            }}>
                <Input
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                    }}
                    placeholder="任务标题"
                />
            </div>
            <Button
                loading={editing}
                type={"primary"}
                disabled={!needSave}
                icon={<SaveOutlined/>}
                onClick={
                    () => {
                        setEditing(true);
                        task.Title = title;
                        task.Note = note;
                        task.BeginTime = beginTime;
                        task.EndTime = endTime;
                        task.Wait4 = wait4;
                        task.TaskType = taskType;
                        if (status === "done") {
                            task.Done = true;
                            task.Started = true;
                        } else if (status === "started") {
                            task.Done = false;
                            task.Started = true;
                        } else {
                            task.Done = false;
                            task.Started = false;
                        }
                        const req: ChangeTaskReq = {
                            UserID: props.addr.userID,
                            Data: task,
                        }
                        sendChangeTask(req, (ret) => {
                            setEditing(false);
                            if (ret.ok) {
                                props.refreshApi();
                            } else {
                                message.error("修改任务失败").then();
                            }
                        })
                    }}
            />
        </Flex>
        <Typography.Text type={"secondary"} copyable>
            {addr.toString()}
        </Typography.Text>
        <Flex gap='10px'>
            <Select
                style={{width: 120}}
                value={taskType}
                onChange={setTaskType}
                placeholder="任务类型"
                options={[
                    {label: "todo", value: 0},
                    {label: "doing", value: 1},
                ]}
            />
            <Select
                style={{width: 120}}
                value={status}
                onChange={setStatus}
                placeholder="任务状态"
                options={[
                    {label: "未开始", value: "not_started"},
                    {label: "进行中", value: "started"},
                    {label: "已完成", value: "done"},
                ]}
            />
        </Flex>
        <Flex
            gap='10px'
        >
            <Button
                onClick={() => {
                    setBeginTime(EmptyGoTimeStr);
                    setEndTime(EmptyGoTimeStr);
                    setWait4("");
                }}
            >
                清除时间与等待
            </Button>
            <Button
            >
                移动
            </Button>
            <Button
                danger={true}
            >
                删除
            </Button>
        </Flex>
        <Flex gap='10px'>
            <Input
                style={{width: "100px"}}
                value={wait4}
                onChange={(e) => {
                    setWait4(e.target.value);
                }}
                placeholder="等待"
            />
            <DatePicker.RangePicker
                placeholder={['无开始时间', '无结束时间']}
                allowEmpty={[true, true]}
                value={[beginTimeJs, endTimeJs]}
                onChange={(date, dateString) => {
                    if (dateString[0] !== "") {
                        setBeginTime(dayjs(dateString[0]).toISOString());
                    } else {
                        setBeginTime("");
                    }
                    if (dateString[1] !== "") {
                        setEndTime(dayjs(dateString[1]).toISOString());
                    } else {
                        setEndTime("");
                    }
                }}
            />
        </Flex>
        <Input.TextArea
            style={{flex: 1}}
            value={note}
            onChange={(e) => {
                setNote(e.target.value);
            }}
            placeholder="任务备注"
        />
    </Flex>
}