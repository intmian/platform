import {Addr} from "./addr";
import {PTask} from "./net/protocal";
import {Button, DatePicker, Flex, Input, message, Select, Typography} from "antd";
import {useCallback, useEffect, useRef, useState} from "react";
import dayjs from "dayjs";
import {EmptyGoTimeStr, IsDateEmptyFromGoEmpty} from "../common/tool";
import {ChangeTaskReq, sendChangeTask} from "./net/send_back";
import {SaveOutlined} from "@ant-design/icons";
import {useIsMobile} from "../common/hooksv2";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

interface TaskDetailProps {
    addr?: Addr
    task?: PTask
    refreshApi?: () => void
}

function Editor(props: { value: string, onChange: (value: string) => void, onUpload: () => void }) {
    const quillRef = useRef<any>(null);
    const isMobile = useIsMobile();

    const handleUpload = async (file: File, isImage: boolean) => {
        const res = await fetch('/api/misc/r2-presigned-url', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                fileName: file.name,
                fileType: file.type,
            }),
        });

        if (!res.ok) {
            message.error("获取上传地址失败").then();
            return;
        }
        const {code, data} = await res.json();
        if (code !== 0) {
            message.error("获取上传地址失败").then();
            return;
        }
        const {UploadURL, PublicURL} = data;

        if (!UploadURL || !PublicURL) {
            message.error("上传失败").then();
            return;
        }

        const res2 = await fetch(UploadURL, {
            method: 'PUT',
            headers: {'Content-Type': file.type},
            body: file,
        });
        if (!res2.ok) {
            message.error("上传文件失败").then();
            return;
        }

        const editor = quillRef.current.getEditor();
        const range = editor.getSelection(true);

        if (isImage) {
            editor.insertEmbed(range.index, 'image', PublicURL);
        } else {
            const displayName = file.name;
            editor.insertText(range.index, displayName, 'link', PublicURL);
        }
        props.onUpload();
    };

    const imageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.onchange = () => {
            const file = input.files?.[0];
            if (file) handleUpload(file, true);
        };
        input.click();
    };

    const attachmentHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.onchange = () => {
            const file = input.files?.[0];
            if (file) handleUpload(file, false);
        };
        input.click();
    };


    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file && file.type.startsWith('image/')) {
                    e.preventDefault(); // 阻止默认粘贴行为（避免重复插入）
                    // 上传图片后插入图片链接
                    (async () => {
                        const res = await fetch('/api/misc/r2-presigned-url', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                fileName: file.name,
                                fileType: file.type,
                            }),
                        });
                        if (!res.ok) {
                            message.error("获取上传地址失败").then();
                            return;
                        }
                        const {code, data} = await res.json();
                        if (code !== 0) {
                            message.error("获取上传地址失败").then();
                            return;
                        }
                        const {UploadURL, PublicURL} = data;
                        if (!UploadURL || !PublicURL) {
                            message.error("上传失败").then();
                            return;
                        }
                        const res2 = await fetch(UploadURL, {
                            method: 'PUT',
                            headers: {'Content-Type': file.type},
                            body: file,
                        });
                        if (!res2.ok) {
                            message.error("上传文件失败").then();
                            return;
                        }
                        // 插入图片链接而不是图片本身
                        const editor = quillRef.current.getEditor();
                        const range = editor.getSelection(true);
                        editor.insertText(range.index, PublicURL, 'link', PublicURL);
                        props.onUpload();
                    })();
                }
            }
        }
    }, []);

    useEffect(() => {
        
    }, [handlePaste]);

    const modules = {
        toolbar: {
            container: [
                [{header: [1, 2, 3, false]}],
                [{list: 'ordered'}, {list: 'bullet'}],
                ['bold', 'italic', 'underline'],
                ['clean'],
                ['image', 'link'],
            ],
            handlers: {
                image: imageHandler,
                link: attachmentHandler,
            },
        },
    };
    const formats = [
        'header',
        'bold', 'italic', 'underline',
        'list',
        'image', 'link',
    ];

    return <Flex style={{flex: 1, width: "100%", height: "100%"}}
                 vertical={true}
    >
        <ReactQuill
            ref={quillRef}
            theme="snow"
            value={props.value}
            onChange={props.onChange}
            placeholder="任务备注"
            modules={modules}
            formats={formats}
            style={{
                flex: 1,
                fontSize: isMobile ? "16px" : undefined,
                height: isMobile ? "70%" : "80%",
            }}
        />
        <div>
            <Typography.Text type={"secondary"}>
                {isMobile ? "回车保存" : "Ctrl|Cmd+Enter保存"}
            </Typography.Text>
        </div>

    </Flex>;
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
            <DatePicker
                placeholder="无开始时间"
                allowClear
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
    </Flex>
}