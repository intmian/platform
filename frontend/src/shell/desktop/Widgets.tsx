import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {RightOutlined} from "@ant-design/icons";
import {useAuth} from "../../common/loginCtx";
import {appById, canUseApp} from "../apps";
import type {TodayDigest} from "../../todone/shellApi";
import {SubscriptionItem, SubscriptionListRet} from "../../common/newSendHttp";
import {request} from "../../common/api";

// 桌面上方的小卡片。数据在桌面出现后才去取，取不到或没什么可说就不显示，不占位置。
export function Widgets({refreshKey}: { refreshKey: number }) {
    const auth = useAuth();
    const has = (id: string) => {
        const app = appById(id);
        return !!app && canUseApp(app, (p) => auth.loginInfo.hasPermission(p));
    };
    return <div className="pf-widgets">
        {has("todone") && <TodayWidget user={auth.loginInfo.usr} refreshKey={refreshKey}/>}
        {has("subscription") && <SubscriptionWidget refreshKey={refreshKey}/>}
    </div>;
}

function TodayWidget({user, refreshKey}: { user: string; refreshKey: number }) {
    const navigate = useNavigate();
    const [digest, setDigest] = useState<TodayDigest | null>(null);

    useEffect(() => {
        let alive = true;
        import("../../todone/shellApi")
            .then((m) => m.loadTodayDigest(user))
            .then((d) => alive && setDigest(d))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [user, refreshKey]);

    if (!digest) return null;
    const empty = digest.overdue === 0 && digest.today === 0;
    return <div className="pf-widget" role="button" onClick={() => navigate("/todone")}>
        <div className="pf-widget-head">
            <span>今天</span>
            <RightOutlined/>
        </div>
        {empty ? <div className="pf-widget-quiet">今天没有到期的事</div> : <>
            <div className="pf-widget-stats">
                {digest.overdue > 0 && <span className="is-bad"><b>{digest.overdue}</b>逾期</span>}
                <span><b>{digest.today}</b>今天</span>
            </div>
            <ul className="pf-widget-list">
                {digest.items.slice(0, 4).map((it, i) => <li key={i} className={it.kind === "overdue" ? "is-bad" : ""}
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 navigate(it.path);
                                                             }}>{it.title}</li>)}
            </ul>
        </>}
    </div>;
}

function checkFailed(s: SubscriptionItem) {
    return s.lastCheckStatus === "request_failed" || s.lastCheckStatus === "parse_failed";
}

function needsAttention(s: SubscriptionItem) {
    if (!s.monitorEnabled) return false;
    if (checkFailed(s)) return true;
    if (s.expireAt && s.expireRemainDays <= 7) return true;
    return s.usagePercent >= 85;
}

function SubscriptionWidget({refreshKey}: { refreshKey: number }) {
    const navigate = useNavigate();
    const [items, setItems] = useState<SubscriptionItem[]>([]);

    useEffect(() => {
        let alive = true;
        request<SubscriptionListRet>("/misc/subscription/list").then((ret) => {
            if (alive && ret.ok) setItems((ret.data.items ?? []).filter(needsAttention));
        });
        return () => {
            alive = false;
        };
    }, [refreshKey]);

    if (items.length === 0) return null;
    return <div className="pf-widget" role="button" onClick={() => navigate("/subscription")}>
        <div className="pf-widget-head">
            <span>订阅</span>
            <RightOutlined/>
        </div>
        <ul className="pf-widget-list">
            {items.slice(0, 3).map((s) => <li key={s.id} className="is-warn">
                {s.name}
                <span className="pf-widget-note">{describe(s)}</span>
            </li>)}
        </ul>
    </div>;
}

function describe(s: SubscriptionItem): string {
    if (checkFailed(s)) return "上次检查失败";
    if (s.expireAt && s.expireRemainDays <= 0) return "已过期";
    if (s.expireAt && s.expireRemainDays <= 7) return `${s.expireRemainDays} 天后到期`;
    return `已用 ${Math.round(s.usagePercent)}%`;
}
