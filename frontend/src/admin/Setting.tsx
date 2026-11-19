import {useCallback, useEffect, useState} from "react";
import {Tabs, theme} from "antd";
import {useBlocker} from "react-router-dom";
import {AISettings} from "./settings/AISettings";
import {BasicSettings} from "./settings/BasicSettings";
import {clearSettingsDirty, confirmLeaveSettings, hasUnsavedSettings, setSettingsDirty} from "./settings/settingsGuard";
import "./settings/settings.css";

function Setting() {
    const [section, setSection] = useState("basic");
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

    // 点顶部导航跳到其他页面时提醒
    const blocker = useBlocker(dirty.basic || dirty.ai);
    useEffect(() => {
        if (blocker.state === "blocked") {
            confirmLeaveSettings(() => blocker.proceed(), () => blocker.reset());
        }
    }, [blocker]);

    const label = (text: string, changed: boolean) => <span>
        {text}
        {changed && <span
            aria-label="有未保存的修改"
            style={{display: "inline-block", width: 6, height: 6, marginLeft: 6, borderRadius: "50%", background: token.colorWarning, verticalAlign: "middle"}}
        />}
    </span>;

    return <div>
        <Tabs
            className="settings-tabs"
            activeKey={section}
            onChange={setSection}
            tabBarStyle={{background: token.colorBgContainer}}
            items={[
                {key: "basic", label: label("基础设置", dirty.basic)},
                {key: "ai", label: label("AI", dirty.ai)},
            ]}
        />
        {/* 两个分类都保持挂载，切换时不丢未保存的修改 */}
        <div style={{display: section === "basic" ? undefined : "none"}}><BasicSettings onDirtyChange={onBasicDirty}/></div>
        <div style={{display: section === "ai" ? undefined : "none"}}><AISettings onDirtyChange={onAIDirty}/></div>
    </div>;
}

export default Setting;
