import {Addr} from "./addr";
import {PTask} from "./net/protocal";
import {Typography} from "antd";


interface TaskDetailProps {
    addr?: Addr
    task?: PTask
    refreshApi?: () => void
}

export function TaskDetail(props: TaskDetailProps) {
    if (!props.addr || !props.task || !props.refreshApi) {
        return <div>
            <Typography.Title level={4}>
                选择任务后，显示详情
            </Typography.Title>
        </div>
    }

    const task = props.task;
    const addr = props.addr.copy();
    addr.addTask(task.ID);

    return <div>
        <Typography.Title level={4}>
            {task.Title}
        </Typography.Title>
        <Typography.Paragraph>
            {task.Note}
        </Typography.Paragraph>
        <Typography.Paragraph>
            {task.BeginTime}
        </Typography.Paragraph>
        <Typography.Paragraph>
            {task.EndTime}
        </Typography.Paragraph>
    </div>
}