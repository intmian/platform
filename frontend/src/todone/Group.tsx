import {PSubGroup, PTask} from "./net/protocal";
import {ReactNode, useEffect, useState} from "react";
import {GetSubGroupReq, sendGetSubGroup} from "./net/send_back";
import {Addr} from "./addr";
import {Button, Flex} from "antd";
import {AppstoreAddOutlined, LoadingOutlined} from "@ant-design/icons";
import {SubGroup, SubGroupAddPanel} from "./SubGroups";

class TaskTree {
    public data: PTask;
    public subTasks: TaskTree[] = [];

    constructor(data: PTask) {
        this.data = data;
    }
}

interface GroupProps {
    addr: Addr | null
    GroupTitle: string
    onSelectTask: (addr: Addr, pTask: PTask, refreshApi: () => void, tree: TaskTree) => void
}

export default function Group(props: GroupProps) {
    
    const [subGroups, setSubGroups] = useState<PSubGroup[]>([]);
    const [addSubGroup, setAddSubGroup] = useState(false);
    const [loading, setLoading] = useState(false);
    // 加载数据
    useEffect(() => {
        setSubGroups([]);
        if (!props.addr || (props.addr.userID === "")) {
            return;
        }
        const req: GetSubGroupReq = {
            UserID: props.addr.userID,
            ParentDirID: props.addr.getParentUnit().ID,
            GroupID: props.addr.getLastUnit().ID,
        }
        setLoading(true);
        sendGetSubGroup(req, (ret) => {
            if (ret.ok && ret.data.SubGroups) {
                setSubGroups(ret.data.SubGroups);
            }
            setLoading(false);
        })
    }, [props.addr]);
    if (!props.addr) {
        return null;
    }

    const nodes: ReactNode[] = [];
    for (let i = 0; i < subGroups.length; i++) {
        const subGroup = subGroups[i];
        nodes.push(
            <SubGroup
                key={subGroup.ID}
                groupAddr={props.addr.copy()}
                subGroup={subGroup}
                onDelete={(sg) => {
                    setSubGroups(subGroups.filter((g) => g.ID !== sg.ID));
                }}
                onSelectTask={(props.onSelectTask)}
            />)
    }

    return <div
        style={{
            marginBottom: "200px",
        }}
    >
        <Flex
            align={"center"}
            style={{
                marginBottom: "10px",
            }}
        >
            <div style={{
                fontSize: 20,
            }}>
                {props.GroupTitle}
            </div>
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
                }}
                    icon={<AppstoreAddOutlined/>}
                    type="text"
            />
            {loading ? <LoadingOutlined spin/> : null}
        </Flex>

        {nodes}
    </div>
}

