import {Addr} from "./addr";
import {PTask} from "./net/protocal";
import {Checkbox, Dropdown, Flex, Tag} from "antd";
import {ReactNode} from "react";
import {MoreOutlined} from "@ant-design/icons";

export interface TaskProps {
    onDelete: () => void
    subGroupAddr: Addr
    task: PTask
}

export function Task(props: TaskProps) {
    const tags: ReactNode[] = []
    for (const tag of props.task.Tags) {
        tags.push(<Tag key={tag} color="blue">{tag}</Tag>)
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
            <Checkbox checked={props.task.Done}/>
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
            {tags}
        </div>
    </div>
}