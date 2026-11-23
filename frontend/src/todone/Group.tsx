import {PSubGroup, PTask} from "./net/protocal";
import {useEffect, useState} from "react";
import {GetSubGroupReq, sendGetSubGroup, sendTaskMove, TaskMoveReq} from "./net/send_back";
import {Addr} from "./addr";
import {Button, Flex, message} from "antd";
import {AppstoreAddOutlined, LoadingOutlined} from "@ant-design/icons";
import {SubGroup, SubGroupAddPanel} from "./SubGroups";
import {normKeyword, SearchBox} from "./search";
import TaskTree from "./TaskTree";
import {
    CollisionDetection,
    closestCenter,
    DndContext,
    DragEndEvent,
    MouseSensor,
    pointerWithin,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";

interface GroupProps {
    addr: Addr | null
    GroupTitle: string
    onSelectTask: (addr: Addr, pTask: PTask, refreshApi: () => void, tree: TaskTree) => void
}

export default function Group(props: GroupProps) {
    const [subGroups, setSubGroups] = useState<PSubGroup[]>([]);
    const [addSubGroup, setAddSubGroup] = useState(false);
    const [loading, setLoading] = useState(false);
    const [refreshTokens, setRefreshTokens] = useState<Record<number, number>>({});
    const [movingSubGroupIDs, setMovingSubGroupIDs] = useState<number[]>([]);
    const [search, setSearch] = useState("");
    const keyword = normKeyword(search);
    // 每个分组各自加载任务，搜索时各自报告有没有命中，用来判断整页是不是一条都没搜到
    const [matched, setMatched] = useState<Record<number, boolean>>({});

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 6,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 160,
                tolerance: 8,
            },
        })
    );

    const collisionDetection: CollisionDetection = (args) => {
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) {
            return pointerCollisions;
        }
        return closestCenter(args);
    };

    const triggerRefresh = (subGroupIDs: number[]) => {
        setRefreshTokens((prev) => {
            const next = {...prev};
            for (const id of subGroupIDs) {
                next[id] = (next[id] || 0) + 1;
            }
            return next;
        });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        if (!props.addr) {
            return;
        }
        const {active, over, delta} = event;
        if (!over) {
            return;
        }

        const activeMeta = active.data.current as {
            type?: string
            taskId?: number
            subGroupID?: number
        } | undefined;

        if (!activeMeta || activeMeta.type !== 'task' || !activeMeta.taskId || !activeMeta.subGroupID) {
            return;
        }

        const targetMeta = over.data.current as {
            type?: string
            taskId?: number
            subGroupID?: number
            parentID?: number
        } | undefined;

        const sourceSubGroup = activeMeta.subGroupID;
        const sourceTaskID = activeMeta.taskId;

        let trgSubGroup = sourceSubGroup;
        let trgTaskID = 0;
        let trgParentID = 0;
        let after = true;

        if (targetMeta?.type === 'task') {
            if (!targetMeta.taskId || !targetMeta.subGroupID) {
                return;
            }
            if (targetMeta.taskId === sourceTaskID) {
                return;
            }
            trgSubGroup = targetMeta.subGroupID;
            trgTaskID = targetMeta.taskId;
            trgParentID = targetMeta.parentID || 0;
            after = delta.y > 0;
        } else if (targetMeta?.type === 'task-children') {
            if (!targetMeta.taskId || !targetMeta.subGroupID) {
                return;
            }
            if (targetMeta.taskId === sourceTaskID) {
                return;
            }
            trgSubGroup = targetMeta.subGroupID;
            trgTaskID = 0;
            trgParentID = targetMeta.taskId;
            after = true;
        } else if (targetMeta?.type === 'subgroup') {
            if (!targetMeta.subGroupID) {
                return;
            }
            trgSubGroup = targetMeta.subGroupID;
            trgTaskID = 0;
            trgParentID = 0;
            after = true;
        } else {
            return;
        }

        const req: TaskMoveReq = {
            UserID: props.addr.userID,
            DirID: props.addr.getParentUnit().ID,
            GroupID: props.addr.getLastUnit().ID,
            SubGroupID: sourceSubGroup,
            TaskIDs: [sourceTaskID],
            TrgDir: props.addr.getParentUnit().ID,
            TrgGroup: props.addr.getLastUnit().ID,
            TrgSubGroup: trgSubGroup,
            TrgParentID: trgParentID,
            TrgTaskID: trgTaskID,
            After: after,
        };

        const movingIDs = Array.from(new Set([sourceSubGroup, trgSubGroup]));
        setMovingSubGroupIDs(movingIDs);

        sendTaskMove(req, (ret) => {
            setMovingSubGroupIDs([]);
            if (ret.ok) {
                triggerRefresh(movingIDs);
                return;
            }
            message.error("移动失败").then();
            triggerRefresh(movingIDs);
        });
    };

    // 加载数据
    useEffect(() => {
        setSubGroups([]);
        setSearch("");
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
            } else if (!ret.ok) {
                // 以前失败时不提示，看起来就是一个空清单
                message.error("加载清单失败").then();
            }
            setLoading(false);
        })
    }, [props.addr]);
    if (!props.addr) {
        return null;
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
                    onAdd={(sg: PSubGroup): void => {
                        setSubGroups((prev) => [...prev, sg]);
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
            <div style={{marginLeft: "auto"}}>
                <SearchBox value={search} onChange={setSearch}/>
            </div>
        </Flex>
        {keyword && subGroups.length > 0 && subGroups.every((sg) => matched[sg.ID] === false) &&
            <div style={{textAlign: "center", color: "var(--pf-text-3)", padding: "24px 0"}}>
                没有找到包含「{search.trim()}」的未完成任务
            </div>}

        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragEnd={handleDragEnd}
        >
            {subGroups.map((subGroup) => (
                <SubGroup
                    key={subGroup.ID}
                    groupAddr={props.addr!.copy()}
                    subGroup={subGroup}
                    onDelete={(sg) => {
                        setSubGroups((prev) => prev.filter((g) => g.ID !== sg.ID));
                    }}
                    onSelectTask={props.onSelectTask}
                    moving={movingSubGroupIDs.includes(subGroup.ID)}
                    externalRefreshToken={refreshTokens[subGroup.ID] || 0}
                    keyword={keyword}
                    onMatchChange={(hit) => setMatched((prev) =>
                        prev[subGroup.ID] === hit ? prev : {...prev, [subGroup.ID]: hit})}
                />
            ))}
        </DndContext>
    </div>
}
