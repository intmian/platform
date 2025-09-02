import {Addr} from "./addr";
import {PTask, TaskType} from "./net/protocal";
import {Button, Checkbox, Dropdown, Flex, MenuProps, message, Modal, Row, Tag} from "antd";
import {ReactNode, useEffect, useState} from "react";
import {
    CheckOutlined,
    DownOutlined,
    LoadingOutlined,
    MinusCircleOutlined,
    PlusCircleOutlined,
    RetweetOutlined,
} from "@ant-design/icons";
import {IsDateEmptyFromGoEmpty} from "../common/tool";
import TaskTree, {TaskTreeNode} from "./TaskTree";
import {TaskList} from "./TaskList";
import {ChangeTaskReq, sendChangeTask, sendDelTask, sendTaskAddTag, sendTaskDelTag} from "./net/send_back";
import {useStateWithLocal} from "../common/hooksv2";
import {TaskMovePanel} from "./TaskDetail";

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
        const hasEndTime = task.EndTime && !(IsDateEmptyFromGoEmpty(task.EndTime))
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
        const hasBeginTime = task.BeginTime && !(IsDateEmptyFromGoEmpty(task.BeginTime))
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
    let dashed = false
    if (status >= Status.StartedBegin && status < Status.FinishedBegin) {
        if (status >= Status.TODO) {
            icon = null
            if (!operating) {
                text = " "
            }
        } else {
            icon = <RetweetOutlined/>
        }
    } else if (status >= Status.FinishedBegin) {
        // 已经结束
        icon = <CheckOutlined/>
    } else {
        // 没有开始情况
        icon = null
        if (!operating) {
            text = " "
        }
        dashed = true
    }
    if (operating) {
        icon = <LoadingOutlined spin={true}/>
    }
    return <Button
        icon={icon}
        type={dashed ? "dashed" : undefined}
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
    if (task.Note !== "") {
        tags.push(<Tag key={"note"} color="gray">有备注</Tag>)
    }
    if (task.Tags) {
        for (const tag of task.Tags) {
            // 如果是[system]开头的标签，特殊处理
            if (tag.startsWith("[system]")) {
                continue;
            }
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
    onSelectTask: () => void
    hasSon?: boolean
    onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function TaskTitle({task, clickShowSubTask, isShowSon, onSelectTask, hasSon, onContextMenu}: TaskTitleProps) {
    // 判断任务状态
    let BeforeBegin = false;
    const beginTime = new Date(task.BeginTime);
    const now = new Date();
    if (!IsDateEmptyFromGoEmpty(task.BeginTime)) {
        if (beginTime.getTime() > now.getTime()) {
            BeforeBegin = true;
        }
    }
    let color = undefined;
    let textDecoration = task.Done ? 'line-through' : 'none';
    if (!task.Started || BeforeBegin) {
        color = '#bfbfbf'; // 灰色
    }
    if (task.Done) {
        textDecoration = 'line-through';
    }
    const isFlag = task.Tags && task.Tags.includes("[system]flag");
    return (
        <Flex
            style={{
                flex: 1,
                overflow: 'hidden',
                alignItems: 'center',
            }}
        >
            <div
                onContextMenu={onContextMenu}
                style={{
                    flex: 1,
                    color,
                    textDecoration,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
                onClick={onSelectTask}
            >
                {isFlag && <span style={{color: 'red'}}>★ </span>}
                {task.Title}
            </div>
            <Button
                size="small"
                type="text"
                onClick={clickShowSubTask}
                style={{
                    marginLeft: 'auto',
                    flex: '0 0 auto'
                }}
                icon={!isShowSon ? hasSon ? <DownOutlined/> : <PlusCircleOutlined/> : <MinusCircleOutlined/>}
            >
            </Button>
        </Flex>
    )
}

function Time2show({time}: { time: Date }) {
    const [refreshTime, setRefreshTime] = useState(1000 * 60);
    const [flag, setFlag] = useState(false);


    // 打印还有多少天多少小时
    const now = new Date();
    let diff = time.getTime() - now.getTime();
    if (diff < 0) {
        diff = -diff;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    let str = "";
    let hasSec = false;
    if (days > 0) {
        str += days + "天";
    }
    if (hours > 0) {
        str += hours + "小时";
    }
    if (days <= 0) {
        if (minutes > 0) {
            str += minutes + "分钟";
        }
        if (seconds > 0 && hours <= 0) {
            str += seconds + "秒";
            hasSec = true;
        }
    }

    useEffect(() => {
        const interval = setInterval(() => {
            setFlag(!flag);
        }, refreshTime);
        if (hasSec && refreshTime !== 1000) {
            setRefreshTime(1000);
        }
        if (!hasSec && refreshTime !== 1000 * 30) {
            setRefreshTime(1000 * 60);
        }
        return () => {
            clearInterval(interval);
        };
    }, [flag, hasSec, refreshTime]);
    return <>{str}</>
}

export function TaskWaitAndTime({status, task}: { status: Status, task: PTask }) {
    // 有wait4就显示wait4，有time就显示time，没到开始时间显示为黄色，正在进行显示未绿色，超过时间显示为红色
    const timeWait: ReactNode[] = [];

    if (task.Wait4 !== "") {
        timeWait.push(
            <Tag
                key="wait4"
            >等待:{task.Wait4}</Tag>
        );
    }

    const now = new Date();
    const beginTime = new Date(task.BeginTime);
    const endTime = new Date(task.EndTime);

    if (status < Status.StartedBegin) {
        if (!IsDateEmptyFromGoEmpty(task.BeginTime)) {
            if (beginTime.getTime() > now.getTime()) {
                timeWait.push(
                    <Tag key={"beginTime"}>
                        剩余:<Time2show time={beginTime}/>
                    </Tag>
                );
            } else {
                timeWait.push(
                    <Tag color="red" key={"beginTime2"}>
                        延期:<Time2show time={beginTime}/>
                    </Tag>
                );
            }
        }
    } else if (status < Status.FinishedBegin) {
        let BeforeBegin = false;
        if (!IsDateEmptyFromGoEmpty(task.BeginTime)) {
            if (beginTime.getTime() > now.getTime()) {
                BeforeBegin = true;
                timeWait.push(
                    <Tag key={"beginTime"}>
                        等待:<Time2show time={beginTime}/>
                    </Tag>
                )
            } else {
                timeWait.push(
                    <Tag key={"beginTime2"}>
                        开始:<Time2show time={beginTime}/>
                    </Tag>
                );
            }
        }
        if (!BeforeBegin && !IsDateEmptyFromGoEmpty(task.EndTime)) {
            if (endTime.getTime() < now.getTime()) {
                timeWait.push(
                    <Tag color="red" key="endtime">
                        过期:<Time2show time={endTime}/>
                    </Tag>
                );
            } else {
                timeWait.push(
                    <Tag color="green" key="endtime2">
                        剩余:<Time2show time={endTime}/>
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
    onSelectTask: (addr: Addr, pTask: PTask, refreshApi: () => void, tree: TaskTree) => void
    selectMode: boolean
    onSelModeSelect: (addr: Addr) => void
}

export function Task(props: TaskProps) {
    // 这里的时间只做显示，不会真正的自动开始或者完成（目前）
    const status = GetTaskStatus(props.task)
    let hasSon: boolean = false;
    if (props.taskNode.children && props.taskNode.children.length > 0) {
        hasSon = true;
    }
    const [showSubTask, setShowSubTask] = useStateWithLocal("todone:task:showSubTask:" + props.task.ID, hasSon);
    const [operate, setOperate] = useState(false); // 是否操作

    // 菜单相关
    const [menuVisible, setMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
    // 新增：菜单loading key
    const [menuLoadingKey, setMenuLoadingKey] = useState<string | null>(null);
    // 移动和删除弹窗控制
    const [showMove, setShowMove] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // 右键事件
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setMenuPosition({x: e.clientX, y: e.clientY});
        setMenuVisible(true);
    };

    // 复制内容
    const handleCopyContent = async () => {
        try {
            await navigator.clipboard.writeText(props.task.Title || "");
            message.success("内容已复制");
        } catch {
            message.error("复制失败");
        }
    };
    // 复制路径
    const handleCopyPath = async () => {
        try {
            await navigator.clipboard.writeText(thisAddr.toString());
            message.success("路径已复制");
        } catch {
            message.error("复制失败");
        }
    };
    // 移动
    const handleMove = () => {
        setShowMove(true);
    };
    // 删除
    const handleDelete = () => {
        setShowDeleteConfirm(true);
    };

    const hasFlag = props.task.Tags && props.task.Tags.includes("[system]flag");

    // 修改：handleFlag 支持回调
    const handleFlag = (cb?: () => void) => {
        if (hasFlag) {
            const req = {
                DirID: props.addr.getLastDirID(),
                GroupID: props.addr.getLastGroupID(),
                SubGroupID: props.addr.getLastSubGroupID(),
                UserID: props.addr.userID,
                TaskID: props.task.ID,
                Tag: "[system]flag",
            }
            sendTaskDelTag(req, (ret) => {
                if (ret.ok) {
                    message.success("取消标记任务成功").then();
                    props.task.Tags = props.task.Tags.filter(tag => tag !== "[system]flag");
                    props.refreshTree();
                } else {
                    message.error("取消标记任务失败").then();
                }
                if (cb) cb();
            })
            return
        }
        const req = {
            DirID: props.addr.getLastDirID(),
            GroupID: props.addr.getLastGroupID(),
            SubGroupID: props.addr.getLastSubGroupID(),
            UserID: props.addr.userID,
            TaskID: props.task.ID,
            Tag: "[system]flag",
        }
        sendTaskAddTag(req, (ret) => {
            if (ret.ok) {
                message.success("标记任务成功").then();
                if (!props.task.Tags) {
                    props.task.Tags = [];
                }
                props.task.Tags.push("[system]flag");
                props.refreshTree();
            } else {
                message.error("标记任务失败").then();
            }
            if (cb) cb();
        })
    }

    // 下方dropdownItems改为动态生成，支持loading
    const dropdownItems: MenuProps['items'] = [
        {
            label: (
                <span>
                    复制内容
                    {menuLoadingKey === "copyContent" && <LoadingOutlined style={{marginLeft: 8}} spin/>}
                </span>
            ),
            key: "copyContent",
            disabled: menuLoadingKey !== null,
        },
        {
            label: (
                <span>
                    复制路径
                    {menuLoadingKey === "copyPath" && <LoadingOutlined style={{marginLeft: 8}} spin/>}
                </span>
            ),
            key: "copyPath",
            disabled: menuLoadingKey !== null,
        },
        {
            label: (
                <span>
                    {hasFlag ? "取消标记" : "标记任务"}
                    {menuLoadingKey === "flag" && <LoadingOutlined style={{marginLeft: 8}} spin/>}
                </span>
            ),
            key: "flag",
            disabled: menuLoadingKey !== null,
        },
        {
            type: "divider"
        },
        {
            label: (
                <span>
                    移动
                </span>
            ),
            key: "move",
            disabled: menuLoadingKey !== null,
        },
        {
            label: (
                <span style={{color: "red"}}>
                    删除
                </span>
            ),
            key: "delete",
            disabled: menuLoadingKey !== null,
        },
    ];

    // 修改菜单点击处理，删除和移动直接关闭菜单，不显示loading
    const dropdownMenuClickHandler = async ({key}: { key: string }) => {
        if (menuLoadingKey) return;
        if (key === "move") {
            handleMove();
            setMenuVisible(false);
            return;
        }
        if (key === "delete") {
            handleDelete();
            setMenuVisible(false);
            return;
        }
        setMenuLoadingKey(key);
        let finish = () => {
            setMenuLoadingKey(null);
            setMenuVisible(false);
        };
        try {
            if (key === "copyContent") {
                await handleCopyContent();
                finish();
            } else if (key === "copyPath") {
                await handleCopyPath();
                finish();
            } else if (key === "flag") {
                // 标记/取消标记为异步，回调后关闭菜单
                handleFlag(finish);
            } else {
                finish();
            }
        } catch {
            finish();
        }
    }

    const thisAddr = props.addr.copy();
    thisAddr.addTask(props.task.ID);

    // 删除确认弹窗
    const handleDeleteConfirm = () => {
        sendDelTask({
            DirID: props.addr.getLastDirID(),
            GroupID: props.addr.getLastGroupID(),
            SubGroupID: props.addr.getLastSubGroupID(),
            UserID: props.addr.userID,
            TaskID: [props.task.ID],
        }, (ret) => {
            if (ret.ok) {
                message.success("删除任务成功").then();
                props.tree.deleteTask(props.task.ID);
                props.refreshTree();
            } else {
                message.error("删除任务失败").then();
            }
            setShowDeleteConfirm(false);
        });
    };

    return <div
        style={{
            width: '100%',
        }}
        onMouseLeave={() => {
            setMenuVisible(false);
        }}
    >
        {/* 右键菜单 */}
        {menuVisible && menuPosition &&
            <div
                style={{
                    position: "fixed",
                    top: menuPosition.y,
                    left: menuPosition.x,
                    zIndex: 1000,
                }}
                onContextMenu={e => e.preventDefault()}
                onMouseLeave={() => setMenuVisible(false)}
            >
                <Dropdown
                    menu={{
                        items: dropdownItems,
                        onClick: dropdownMenuClickHandler,
                    }}
                    open={menuVisible}
                    trigger={[]}
                    placement="bottomLeft"
                >
                    <div/>
                </Dropdown>
            </div>
        }
        {/*移动弹窗 */}
        {showMove && (
            <TaskMovePanel
                subGroupAddr={props.addr}
                movedTasks={[props.task.ID]}
                refreshApi={props.refreshTree}
                tree={props.tree}
                onCancel={() => setShowMove(false)}
                onFinish={() => {
                    setShowMove(false);
                    // 刷新浏览器标签页
                    document.location.reload();
                }}
            />
        )}
        {/*删除确认弹窗 */}
        <Modal
            open={showDeleteConfirm}
            title="确认删除"
            okText="删除"
            okButtonProps={{danger: true}}
            cancelText="取消"
            onCancel={() => setShowDeleteConfirm(false)}
            onOk={handleDeleteConfirm}
        >
            确认要删除该任务吗？此操作不可恢复。
        </Modal>
        <Flex
            style={{
                columnGap: '10px',
                // 子组件居中
                alignItems: 'center',
                marginBottom: '2px',
                width: '100%',
            }}
        >
            <TaskStatusOperate
                operating={operate}
                onClick={
                    () => {
                        setOperate(true);
                        const pTask = props.tree.findTask(props.task.ID);
                        if (!pTask) {
                            return;
                        }
                        if (!pTask.task.Started) {
                            pTask.task.Started = true;
                        } else if (!pTask.task.Done) {
                            pTask.task.Done = true;
                        } else {
                            pTask.task.Done = false;
                            // 考虑使用频率，直接启动这些任务，如果希望回到未开始可以在detail改。
                            pTask.task.Started = true;
                        }
                        const req: ChangeTaskReq = {
                            DirID: props.addr.getLastDirID(),
                            GroupID: props.addr.getLastGroupID(),
                            SubGroupID: props.addr.getLastSubGroupID(),
                            Data: pTask.task, UserID: props.addr.userID
                        }
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
                onSelectTask={() => {
                    props.onSelectTask(thisAddr, props.task, props.refreshTree, props.tree);
                }}
                task={props.task}
                clickShowSubTask={() => {
                    setShowSubTask(!showSubTask);
                }}
                isShowSon={showSubTask}
                hasSon={hasSon}
                onContextMenu={handleContextMenu}
            />
            {props.selectMode && <Checkbox
                onChange={() => {
                    props.onSelModeSelect(thisAddr);
                }}
            />}
        </Flex>
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
                selectMode={props.selectMode}
                onSelModeSelect={props.onSelModeSelect}
            />
        </Row>
        }
    </div>
}