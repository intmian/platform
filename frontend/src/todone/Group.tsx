import {PSubGroup, PTask} from "./net/protocal";
import {ReactNode, useEffect, useState} from "react";
import {CreateSubGroupReq, GetSubGroupReq, sendCreateSubGroup, sendGetSubGroup} from "./net/send_back";
import {Addr} from "./addr";
import {Button, Collapse, CollapseProps, Divider, Form, Input, message, Modal, Space, Tooltip} from "antd";

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
    addr: Addr | null
    GroupTitle: string
}

export default function Group(props: GroupProps) {
    const [subGroups, setSubGroups] = useState<PSubGroup[]>([]);
    const [addSubGroup, setAddSubGroup] = useState(false);
    // 加载数据
    useEffect(() => {
        if (!props.addr) {
            return;
        }
        const req: GetSubGroupReq = {
            UserID: props.addr.userID,
            ParentDirID: props.addr.getParentUnit().ID,
            GroupID: props.addr.getLastUnit().ID,
        }
        sendGetSubGroup(req, (ret) => {
            if (ret.ok && ret.data.SubGroups) {
                setSubGroups(ret.data.SubGroups);
            }
        })
    }, [props.addr]);
    if (!props.addr) {
        return null;
    }

    const nodes: ReactNode[] = [];
    for (let i = 0; i < subGroups.length; i++) {
        const subGroup = subGroups[i];
        nodes.push(<Divider orientation="left" key={`divider-${i}`}>
            <Tooltip title={subGroup.Note}> key={subGroup.ID}
                {subGroup.Title}
            </Tooltip>
        </Divider>)
        nodes.push(<SubGroup key={subGroup.ID} groupAddr={props.addr} subGroup={subGroup} onDelete={(sg) => {
            setSubGroups(subGroups.filter((g) => g.ID !== sg.ID));
        }}/>)
    }

    return <div>
        <Space>
            <div>{props.GroupTitle}</div>
        </Space>
        {addSubGroup ?
            <SubGroupAddPanel
                userID={props.addr.userID}
                dirID={props.addr.getParentUnit().ID} groupID={props.addr.getLastUnit().ID}
                onAdd={function (sg: PSubGroup): void {
                    setSubGroups([...subGroups, sg]);
                    setAddSubGroup(false);
                }}
                onCancel={() => {
                    setAddSubGroup(false);
                }}
            /> : null
        }
        <Button onClick={
            () => {
                setAddSubGroup(true);
            }
        }>
            添加分组
        </Button>
        {nodes}
    </div>
}

interface SubGroupAddPanelProps {
    userID: string
    dirID: number
    groupID: number
    onAdd: (sg: PSubGroup) => void
    onCancel: () => void
}

function SubGroupAddPanel(props: SubGroupAddPanelProps) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    return <Modal
        open={true}
        title="添加分组"
        okText="添加"
        cancelText="取消"
        onCancel={props.onCancel}
        closeIcon={null}
        confirmLoading={loading}
        onOk={() => {
            setLoading(true);
            const values = form.getFieldsValue();
            const req: CreateSubGroupReq = {
                UserID: props.userID,
                ParentDirID: props.dirID,
                GroupID: props.groupID,
                Title: values.title,
                Note: values.note,
                AfterID: 0,
            }
            // 发送请求
            sendCreateSubGroup(req, (ret) => {
                if (ret.ok) {
                    message.success("添加分组成功").then();
                } else {
                    message.error("添加分组失败").then();
                }
                if (ret.ok) {
                    const sg = {
                        ID: ret.data.SubGroupID,
                        Title: values.title,
                        Note: values.note,
                        Index: ret.data.Index,
                    }
                    props.onAdd(sg);
                }
                setLoading(false);
            })
        }}
    >
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
        </Form>
    </Modal>

}

interface SubGroupProps {
    groupAddr: Addr
    subGroup: PSubGroup
    onDelete: (subGroup: PSubGroup) => void;
}

function SubGroup(props: SubGroupProps) {
    const items: CollapseProps['items'] = [
        {
            key: '1',
            label: props.subGroup.Title,
            children: null,
        },
    ];

    return <>
        <Collapse
            items={items}
            defaultActiveKey={['1']}
        />
    </>
}