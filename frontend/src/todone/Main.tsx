import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, Drawer, FloatButton, Result, Spin, theme} from "antd";
import {MenuOutlined, StarOutlined} from "@ant-design/icons";
import {Navigate, useNavigate, useParams} from "react-router-dom";
import {useAuth} from "../common/loginCtx";
import {useIsMobile} from "../common/breakpoints";
import {useAppActive, useAppTitle, useIsAppActive} from "../shell/runtime";
import {loadDesktop, useDesktopLayout} from "../shell/desktop/store";
import {Dir} from "./Dir";
import {Addr} from "./addr";
import {GroupReloadCtx} from "./reloadCtx";
import Group from "./Group";
import {TaskDetail} from "./TaskDetail";
import {GroupType, PDirTree, PTask} from "./net/protocal";
import TaskTree from "./TaskTree";
import Library from "./Library";
import Routine from "./Routine";
import Overview from "./Overview";
import {OverviewGroup, sendGetDirTree} from "./net/send_back";
import {locateInPage, LocateTarget} from "./locate";
import {findGroupInTree, parseGroupIdParam, parseLegacyGroupParam, TODONE_BASE, todoneGroupPath} from "./route";

// 旧格式的分组地址（/todone/<编码后的 addr|title|type>），换成 /todone/g/<id>
export function LegacyGroupRedirect() {
    const {legacy} = useParams();
    const id = parseLegacyGroupParam(legacy);
    return <Navigate to={id ? todoneGroupPath(id) : `${TODONE_BASE}/g/0`} replace/>;
}

type TreeState = 'loading' | 'ok' | 'error';

/**
 * Todone 的页面框架：左侧目录抽屉 + 中间的关注页或分组页 + 右侧任务详情。
 * 地址里只有分组 ID，所在目录、标题、类型都从目录树里查；目录树加载完之前不渲染分组页。
 */
export function Todone() {
    const {groupId: rawGroupId} = useParams();
    const showOverview = rawGroupId === undefined;
    const groupId = parseGroupIdParam(rawGroupId);
    const userID = useAuth().loginInfo.usr;
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const active = useIsAppActive();
    const {token} = theme.useToken();

    const [dirTree, setDirTree] = useState<PDirTree | null>(null);
    const [treeState, setTreeState] = useState<TreeState>('loading');
    const [showDir, setShowDir] = useState(false);
    // 移动任务后整页重新挂载当前清单（替代以前的刷新浏览器）
    const [reloadNonce, setReloadNonce] = useState(0);
    const reloadGroup = useCallback(() => {
        setSelectTaskAddr(undefined);
        setReloadNonce((n) => n + 1);
    }, []);
    const [selectTaskAddr, setSelectTaskAddr] = useState<Addr>();
    const taskRef = useRef<PTask>();
    const refreshApiRef = useRef<() => void>();
    const treeRef = useRef<TaskTree>();

    const loadTree = useCallback((quiet = false) => {
        if (!quiet) setTreeState('loading');
        sendGetDirTree({UserID: userID}, (ret) => {
            if (ret.ok && ret.data.DirTree) {
                setDirTree(ret.data.DirTree);
                setTreeState('ok');
            } else if (!quiet) {
                setTreeState('error');
            }
        });
    }, [userID]);

    useEffect(() => {
        loadTree();
    }, [loadTree]);

    // 从别的应用切回来时静默刷新目录（别的设备上可能新建、改名了分组）
    useAppActive(() => loadTree(true));

    // “添加到桌面”要用桌面布局；直接打开 Todone 时桌面还没加载过
    const desktop = useDesktopLayout();
    useEffect(() => {
        if (!desktop && userID) void loadDesktop(userID);
    }, [desktop, userID]);

    const found = useMemo(() => groupId ? findGroupInTree(dirTree, groupId) : null, [dirTree, groupId]);
    const groupTitle = found?.group.Title ?? '';
    const groupType = found?.group.Type ?? GroupType.Normal;
    // Addr 只在目录链变化时换新，避免分组页因为目录树刷新而重新加载
    const addrKey = found ? [...found.dirIDs.map((d) => `dir-${d}`), `grp-${found.group.ID}`].join('/') : '';
    const addr = useMemo(() => {
        if (!addrKey) return null;
        const a = new Addr(userID);
        a.bindAddr(addrKey);
        return a;
    }, [addrKey, userID]);

    useAppTitle(showOverview ? '关注' : groupTitle || null);

    // 换了分组，右侧任务详情跟着关掉
    useEffect(() => {
        setSelectTaskAddr(undefined);
    }, [addrKey]);

    const openGroup = (id: number) => {
        navigate(todoneGroupPath(id));
        setShowDir(false);
    };

    const openOverview = () => {
        navigate(TODONE_BASE);
        setShowDir(false);
    };

    // 从“关注”页打开清单；带了 target 就滚到那条任务（或那一栏）并闪一下
    const openOverviewGroup = (g: OverviewGroup, target?: LocateTarget) => {
        openGroup(g.GroupID);
        if (target) locateInPage(target);
    };

    let page;
    if (showOverview) {
        page = <Overview userID={userID} onOpenGroup={openOverviewGroup}/>;
    } else if (treeState === 'loading' && !found) {
        page = <div style={{display: 'flex', justifyContent: 'center', padding: '80px 0'}}><Spin/></div>;
    } else if (treeState === 'error' && !found) {
        page = <Result status="warning" title="目录加载失败"
                       extra={<Button onClick={() => loadTree()}>重试</Button>}/>;
    } else if (!found || !addr) {
        page = <Result status="404" title="清单不存在或已删除"
                       extra={<Button type="primary" onClick={openOverview}>回到关注</Button>}/>;
    } else if (groupType === GroupType.Library) {
        page = <Library key={found.group.ID} addr={addr} groupTitle={groupTitle}/>;
    } else if (groupType === GroupType.Routine) {
        page = <Routine key={found.group.ID} addr={addr} groupTitle={groupTitle}/>;
    } else {
        page = <Group
            key={`${found.group.ID}-${reloadNonce}`}
            addr={addr}
            GroupTitle={groupTitle}
            onSelectTask={(taskAddr, pTask, refreshApi, tree) => {
                setSelectTaskAddr(taskAddr);
                taskRef.current = pTask;
                refreshApiRef.current = refreshApi;
                treeRef.current = tree;
            }}
        />;
    }

    const wide = showOverview || !found || groupType === GroupType.Library;

    // 宽屏：目录按钮浮在左上角，内容区左边让出位置；手机：按钮放进页面顶部，跟内容一起排，不再压住标题
    return <GroupReloadCtx.Provider value={reloadGroup}><div style={{display: 'flex', justifyContent: 'center', paddingLeft: isMobile ? 0 : 56, boxSizing: 'border-box'}}>
        {!isMobile && !showDir ?
            <FloatButton
                style={{left: 10, top: 'calc(var(--safe-top, 0px) + 30px)'}}
                icon={<MenuOutlined/>}
                tooltip={<div>目录</div>}
                onClick={() => setShowDir(true)}
            /> : null}
        {/* 抽屉挂在 body 上，Todone 切到后台时要跟着收起来，不然会盖在别的应用上 */}
        <Drawer
            autoFocus={false}
            title="目录"
            placement="left"
            closable={true}
            onClose={() => setShowDir(false)}
            open={showDir && active}
            width={isMobile ? '70%' : '400px'}
        >
            <div style={{width: "100%"}}>
                <div
                    onClick={openOverview}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        marginBottom: 12,
                        borderRadius: token.borderRadius,
                        cursor: 'pointer',
                        fontWeight: 500,
                        color: showOverview ? token.colorPrimary : token.colorText,
                        background: showOverview ? token.colorPrimaryBg : token.colorFillQuaternary,
                    }}
                >
                    <StarOutlined/> 关注
                </div>
                <Dir
                    userID={userID}
                    dirTree={dirTree}
                    loading={treeState === 'loading' && !dirTree}
                    onTreeChange={setDirTree}
                    onSelectGroup={openGroup}
                />
            </div>
        </Drawer>

        <div
            style={{
                // 总视图在宽屏是看板，铺满；窄一点时由 Overview 自己限宽居中
                width: showOverview
                    ? (isMobile ? '90%' : '94%')
                    : (isMobile || wide) ? '90%' : '650px',
                minHeight: '100%',
            }}
        >
            {isMobile && <div style={{paddingTop: 'calc(var(--safe-top, 0px) + 6px)', marginLeft: -8}}>
                <Button type="text" icon={<MenuOutlined/>} onClick={() => setShowDir(true)}>目录</Button>
            </div>}
            {page}
        </div>

        <Drawer
            title="任务详情"
            placement="right"
            closable={true}
            onClose={() => setSelectTaskAddr(undefined)}
            open={selectTaskAddr !== undefined && active}
            width={isMobile ? '80%' : '400px'}
        >
            {selectTaskAddr && taskRef.current && refreshApiRef.current && treeRef.current &&
                <TaskDetail addr={selectTaskAddr} task={taskRef.current} refreshApi={refreshApiRef.current}
                            tree={treeRef.current}/>}
        </Drawer>
    </div></GroupReloadCtx.Provider>
}
