import {Addr, AddrUnitType} from "./addr";
import {PTask} from "./net/protocal";
import {Button, DatePicker, Flex, Form, Input, message, Modal, Select, Typography} from "antd";
import {useEffect, useState} from "react";
import dayjs from "dayjs";
import {EmptyGoTimeStr, IsDateEmptyFromGoEmpty} from "../common/tool";
import {ChangeTaskReq, sendChangeTask, sendDelTask, sendTaskMove, TaskMoveReq} from "./net/send_back";
import {SaveOutlined} from "@ant-design/icons";
import {useIsMobile} from "../common/hooksv2";
import "react-quill-new/dist/quill.snow.css";
import TaskTree from "./TaskTree";
import {Editor} from "./TaskDetailEditor";

interface TaskDetailProps {
    addr: Addr
    task: PTask
    refreshApi: () => void
    tree: TaskTree
}

export function TaskDetail(props: TaskDetailProps) {
    const [title, setTitle] = useState("");
    const [note, setNote] = useState("");
    const [beginTime, setBeginTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [wait4, setWait4] = useState("");
    const [taskType, setTaskType] = useState<number>(0);
    const [status, setStatus] = useState<"not_started" | "started" | "done">("not_started");
    const isMobile = useIsMobile();
    const [showMove, setShowMove] = useState(false);

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

    function sendSave() {
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
            DirID: addr.getLastDirID(),
            GroupID: addr.getLastGroupID(),
            SubGroupID: addr.getLastSubGroupID(),
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
    }

    return <Flex
        // 如果手机端，输入回车后保存，如果pc端ctrl或cmd+enter保存
        onKeyDown={(e) => {
            if (isMobile) {
                if (e.key === "Enter") {
                    sendSave();
                }
            } else {
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === "Enter") {
                        sendSave();
                    }
                }
            }
        }}
        vertical={true}
        style={{
            height: "100%",
            // padding: 10,
        }}
        gap={10}
    >
        <Flex>
            <div style={{
                flex: 1,
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
                onClick={() => {
                    sendSave();
                }}
            />
        </Flex>
        <Typography.Text type={"secondary"} copyable={{
            text: addr.toString(),
            tooltips: ["复制", "复制成功"],
        }}>
            {addr.toString()}
        </Typography.Text>
        <Flex gap='10px'>
            <Select
                style={{width: 120}}
                value={taskType}
                onChange={setTaskType}
                placeholder="任务类型"
                options={[
                    {label: "TODO", value: 0},
                    {label: "DOING", value: 1},
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
                清除高级
            </Button>
            <Button
                onClick={() => {
                    setShowMove(true);
                }}
            >
                移动
            </Button>
            <Button
                onClick={() => {
                    sendDelTask({
                        DirID: props.addr.getLastDirID(),
                        GroupID: props.addr.getLastGroupID(),
                        SubGroupID: props.addr.getLastSubGroupID(),
                        UserID: props.addr.userID,
                        TaskID: [task.ID],
                    }, (ret) => {
                        if (ret.ok) {
                            message.success("删除任务成功").then();
                            props.tree.deleteTask(task.ID);
                            props.refreshApi();
                        } else {
                            message.error("删除任务失败").then();
                        }
                    })
                }}
                danger={true}
            >
                删除
            </Button>
        </Flex>
        <Input
            style={{width: "100%"}}
            value={wait4}
            onChange={(e) => {
                setWait4(e.target.value);
            }}
            placeholder="等待"
        />
        <Flex gap='10px'>
            <DatePicker
                placeholder="无开始时间"
                allowClear
                style={{width: "45%"}}
                value={beginTimeJs}
                onChange={(date, dateString) => {
                    if (dateString !== "") {
                        setBeginTime(dayjs(dateString).toISOString());
                    } else {
                        setBeginTime(EmptyGoTimeStr);
                    }
                }}
            />
            <DatePicker
                placeholder="无结束时间"
                allowClear
                value={endTimeJs}
                style={{width: "45%"}}

                onChange={(date, dateString) => {
                    if (dateString !== "") {
                        setEndTime(dayjs(dateString + "23:59:59").toISOString());
                    } else {
                        setEndTime(EmptyGoTimeStr);
                    }
                }}
            />
        </Flex>
        <Editor value={note} onChange={setNote} onUpload={sendSave}/>
        <div>
            <Typography.Text type={"secondary"}>
                {isMobile ? "回车保存" : "Ctrl|Cmd+Enter保存"}
            </Typography.Text>
        </div>
        {showMove ? <TaskMovePanel
            subGroupAddr={addr}
            movedTasks={[task.ID]}
            refreshApi={props.refreshApi}
            tree={props.tree}
            onCancel={() => setShowMove(false)}
            onFinish={() => {
                setShowMove(false);
                // 刷新浏览器标签页
                document.location.reload();
            }}
        /> : null}
    </Flex>
}


export interface TaskMoveProps {
    subGroupAddr: Addr
    movedTasks: number[]
    tree: TaskTree
    onCancel: () => void
    onFinish: () => void
}

export function TaskMovePanel(props: TaskMoveProps) {
    const userID = props.subGroupAddr.userID;
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [trgAddrStr, setTrgAddrStr] = useState("");
    let trgIsTask = false
    const trgAddr = new Addr(userID);
    let trgTaskID = 0;
    let trgParent = 0;
    if (trgAddrStr.length > 0) {
        trgAddr.bindAddr(trgAddrStr);
        if (trgAddr.getLastUnit().Type === AddrUnitType.Task) {
            trgIsTask = true
        }
        if (trgIsTask) {
            const last = trgAddr.getLastUnit();
            const Parent = trgAddr.getParentUnit();
            trgTaskID = last.ID;
            if (Parent.Type === AddrUnitType.Task) {
                trgParent = Parent.ID;
            }
        }
    }

    useEffect(() => {
        form.setFieldsValue({
            movePosition: trgIsTask ? "inside" : "after",
        });
    }, [form, trgIsTask]);

    return <Modal
        open={true}
        title={props.movedTasks.length > 1 ? "批量移动任务" : "移动任务"}
        okText="移动"
        cancelText="取消"
        onCancel={props.onCancel}
        closeIcon={null}
        confirmLoading={loading}
        onOk={() => {
            const values = form.getFieldsValue();
            let after = true
            if (values.movePosition === "before") {
                after = false
            }
            if (values.movePosition === "inside") {
                trgParent = trgTaskID
                trgTaskID = 0;
            }

            const req: TaskMoveReq = {
                After: after,
                DirID: props.subGroupAddr.getLastDirID(),
                GroupID: props.subGroupAddr.getLastGroupID(),
                SubGroupID: props.subGroupAddr.getLastSubGroupID(),
                TaskIDs: props.movedTasks,

                TrgDir: trgAddr.getLastDirID(),
                TrgGroup: trgAddr.getLastGroupID(),
                TrgSubGroup: trgAddr.getLastSubGroupID(),

                TrgParentID: trgParent,
                TrgTaskID: trgTaskID,

                UserID: userID
            }
            setLoading(true);
            sendTaskMove(req, (ret) => {
                setLoading(false);
                if (ret.ok) {
                    message.success("移动任务成功").then();
                    props.onFinish();
                } else {
                    message.error("移动任务失败").then();
                }
            })
        }}
    >
        <Form form={form}>
            <Form.Item label={"目标地址"} name={"trgAddr"}
                       rules={[{required: true, message: "请输入目标地址"}]}
            >
                <Input
                    value={trgAddrStr}
                    onChange={(e) => {
                        setTrgAddrStr(e.target.value);
                    }}
                />
            </Form.Item>
            <Form.Item label={"移动位置"} name={"movePosition"}>
                <Select
                    onChange={(value) => {
                        form.setFieldsValue({movePosition: value});
                        console.log("movePosition", value);
                    }}
                >
                    <Select.Option value="before">{trgIsTask ? "移到之前" : "移到最前"}</Select.Option>
                    <Select.Option value="after">{trgIsTask ? "移到之后" : "移到最后"}</Select.Option>
                    {trgIsTask ? <Select.Option value="inside">移到子任务</Select.Option> : null}
                </Select>
            </Form.Item>
        </Form>
    </Modal>
}