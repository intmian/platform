import {useCallback, useEffect, useRef, useState} from "react";
import {Segmented, theme} from "antd";
import {PageHeader} from "../common/PageHeader";
import {Navigate, useBlocker, useNavigate, useParams, useResolvedPath} from "react-router-dom";
import {AISettings} from "./settings/AISettings";
import {BasicSettings} from "./settings/BasicSettings";
import {AIView} from "./settings/aiConfigModel";
import {clearSettingsDirty, confirmLeaveSettings, hasUnsavedSettings, setSettingsDirty} from "./settings/settingsGuard";
import "./settings/settings.css";

// 地址：/admin/setting/basic、/admin/setting/ai[/queues|/providers]，每个分类都能单独固定到桌面
type Section = "basic" | "ai";
const AI_VIEWS: AIView[] = ["overview", "queues", "providers"];

function Setting() {
    const splat = (useParams()["*"] ?? "").split("/").filter(Boolean);
    const base = useResolvedPath(".").pathname.replace(/\/$/, "");
    const navigate = useNavigate();
    const section = splat[0] as Section | undefined;
    const aiView: AIView = AI_VIEWS.includes(splat[1] as AIView) ? splat[1] as AIView : "overview";

    // 从基础设置切回 AI 时回到上次看的子页
    const lastAIView = useRef<AIView>(aiView);
    if (section === "ai") lastAIView.current = aiView;

    const [dirty, setDirty] = useState({basic: false, ai: false});
    const {token} = theme.useToken();

    const onBasicDirty = useCallback((value: boolean) => {
        setSettingsDirty("basic", value);
        setDirty((current) => ({...current, basic: value}));
    }, []);

    const onAIDirty = useCallback((value: boolean) => {
        setSettingsDirty("ai", value);
        setDirty((current) => ({...current, ai: value}));
    }, []);

    // 关闭或刷新页面时提醒
    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (hasUnsavedSettings()) {
                event.preventDefault();
            }
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
            clearSettingsDirty();
        };
    }, []);

    // 离开设置页（后台其他分区、回桌面、切到别的应用）时提醒；设置页内部切分类不拦
    const blocker = useBlocker(({nextLocation}) => (
        (dirty.basic || dirty.ai) && nextLocation.pathname !== base && !nextLocation.pathname.startsWith(base + "/")
    ));
    useEffect(() => {
        if (blocker.state === "blocked") {
            confirmLeaveSettings(() => blocker.proceed(), () => blocker.reset());
        }
    }, [blocker]);

    const aiPath = useCallback((view: AIView) => view === "overview" ? `${base}/ai` : `${base}/ai/${view}`, [base]);
    const onAIViewChange = useCallback((view: AIView) => navigate(aiPath(view)), [aiPath, navigate]);

    if (section !== "basic" && section !== "ai") {
        return <Navigate to={`${base}/basic`} replace/>;
    }

    const label = (text: string, changed: boolean) => <span>
        {text}
        {changed && <span
            aria-label="有未保存的修改"
            style={{display: "inline-block", width: 6, height: 6, marginLeft: 6, borderRadius: "50%", background: token.colorWarning, verticalAlign: "middle"}}
        />}
    </span>;

    return <div>
        <PageHeader
            title="设置"
            meta={(dirty.basic || dirty.ai) ? "有未保存的修改" : undefined}
            extra={<Segmented<Section>
                value={section}
                onChange={(key) => navigate(key === "ai" ? aiPath(lastAIView.current) : `${base}/${key}`)}
                options={[
                    {value: "basic", label: label("基础设置", dirty.basic)},
                    {value: "ai", label: label("AI", dirty.ai)},
                ]}
            />}
        />
        {/* 两个分类都保持挂载，切换时不丢未保存的修改 */}
        <div style={{display: section === "basic" ? undefined : "none"}}><BasicSettings onDirtyChange={onBasicDirty}/></div>
        <div style={{display: section === "ai" ? undefined : "none"}}>
            <AISettings onDirtyChange={onAIDirty} view={lastAIView.current} onViewChange={onAIViewChange}/>
        </div>
    </div>;
}

export default Setting;
