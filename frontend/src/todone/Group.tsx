import {PSubGroup, PTask} from "./net/protocal";
import {ReactNode, useEffect, useState} from "react";
import {GetSubGroupReq, sendGetSubGroup} from "./net/send_back";
import {Addr} from "./addr";
import {Button, Divider, Form, Input, Modal, Space, Switch} from "antd";

// SubGroupTree 用来存储并管理数据
class SubGroupTree {
    constructor(data: PSubGroup) {
        this.data = data;
    }

    public data: PSubGroup;
}

class TaskTree {
    constructor(data: PTask) {
        this.data = data;
    }

    public data: PTask;
    public subTasks: TaskTree[] = [];
}

interface GroupProps {
    addr: Addr
    GroupTitle: string
    onChooseTask: (task: TaskTree) => void;
}

function Group(props: GroupProps) {
    const [subGroups, setSubGroups] = useState<PSubGroup[]>([]);

    // 加载数据
    useEffect(() => {
        const req: GetSubGroupReq = {
            UserID: props.addr.userID,
            ParentDirID: props.addr.getParentUnit().ID,
            GroupID: props.addr.getLastUnit().ID,
        }
        sendGetSubGroup(req, (ret) => {
            if (ret.ok) {
                setSubGroups(ret.data.SubGroups);
            }
        })
    }, [props.addr]);

    const nodes: ReactNode[] = [];
    for (let i = 0; i < subGroups.length; i++) {
        const subGroup = subGroups[i];
        nodes.push(<SubGroup key={subGroup.ID} groupAddr={props.addr} subGroup={subGroup} onDelete={(sg) => {
            setSubGroups(subGroups.filter((g) => g.ID !== sg.ID));
        }}/>)
        if (i < subGroups.length - 1) {
            nodes.push(<Divider key={`divider-${i}`}/>)
        }
    }

    return <div>
        <Space>
            <div>{props.GroupTitle}</div>
        </Space>
        <Button onClick={
            () => {

            }
        }>
            添加分组
        </Button>
        {nodes}
    </div>
}

function SubGroupAddPanel({dirID, groupID, onAdd, onCancel}: {
    dirID: number,
    groupID: number,
    onAdd: (sg: PSubGroup) => void
}, onCancel: () => void) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    return <Modal
        open={true}
        title="添加分组"
        onCancel={onCancel}
        closeIcon={null}
        confirmLoading={loading}
    >
        <Form form={form}>
            <Form form={form}>
                <Form.Item label={"标题"} name={"title"}
                           rules={[{required: true, message: "请输入标题"}]}
                >
                    <Input/>
                </Form.Item>
                <Form.Item label={"备注"} name={"note"}
                >
                    <Input/>
                </Form.Item>
                <Form.Item label={"是否为任务组"} name={"isGroup"}>
                    <Switch/>
                </Form.Item>
            </Form>

        </Form>

    </Modal>

}

interface SubGroupProps {
    groupAddr: Addr
    subGroup: PSubGroup
    onDelete: (subGroup: PSubGroup) => void;
}

function SubGroup(props: SubGroupProps) {

}