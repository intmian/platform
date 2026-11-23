import {useCallback, useEffect, useMemo, useState} from "react";
import {Badge, Flex, Spin, Tabs, message} from "antd";
import {
    AIModelQueue,
    AIPlatformConfig,
    AIProviderConfig,
    getAIPlatformConfig,
    saveAIPlatformConfig,
} from "../../common/aiConfig";
import {AIBusinessPanel} from "./AIBusinessPanel";
import {AIProviderPanel} from "./AIProviderPanel";
import {AIQueuePanel} from "./AIQueuePanel";
import {SaveBar} from "./SaveBar";
import {AIView, BUSINESS_DEFINITIONS, collectChanges, collectIssues, nextID, reconcileConfig} from "./aiConfigModel";

export function AISettings({onDirtyChange}: {onDirtyChange: (dirty: boolean) => void}) {
    const [value, setValue] = useState<AIPlatformConfig | null>(null);
    const [saved, setSaved] = useState<AIPlatformConfig | null>(null);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState<AIView>("overview");
    const [queueID, setQueueID] = useState<string | null>(null);
    const [providerID, setProviderID] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const config = await getAIPlatformConfig();
            setValue(config);
            setSaved(config);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 配置加载失败");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const dirty = useMemo(() => JSON.stringify(value) !== JSON.stringify(saved), [saved, value]);

    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

    if (!value || !saved) {
        return <Flex justify="center" style={{padding: 48}}><Spin/></Flex>;
    }

    const update = (change: (current: AIPlatformConfig) => AIPlatformConfig) => {
        setValue((current) => current ? reconcileConfig(change(current)) : current);
    };

    const bindBusiness = (scene: string, nextQueueID: string) => update((current) => ({
        ...current,
        businesses: BUSINESS_DEFINITIONS.map((definition) => ({
            scene: definition.scene,
            type: definition.type,
            queueID: definition.scene === scene
                ? nextQueueID
                : (current.businesses.find((binding) => binding.scene === definition.scene)?.queueID ?? ""),
        })),
    }));

    const addQueue = (queue: AIModelQueue) => {
        update((current) => ({...current, queues: [...current.queues, queue]}));
        setQueueID(queue.id);
        setView("queues");
    };

    const createQueueForBusiness = (scene: string) => {
        const definition = BUSINESS_DEFINITIONS.find((item) => item.scene === scene);
        if (!definition) {
            return;
        }
        const queue: AIModelQueue = {id: nextID("queue"), name: definition.label, type: definition.type, items: []};
        update((current) => ({
            ...current,
            queues: [...current.queues, queue],
            businesses: BUSINESS_DEFINITIONS.map((item) => ({
                scene: item.scene,
                type: item.type,
                queueID: item.scene === scene ? queue.id : (current.businesses.find((binding) => binding.scene === item.scene)?.queueID ?? ""),
            })),
        }));
        setQueueID(queue.id);
        setView("queues");
    };

    const addProvider = () => {
        const provider: AIProviderConfig = {id: nextID("provider"), name: "新供应商", protocol: "OpenAI", baseURL: "", token: "", models: []};
        update((current) => ({...current, providers: [...current.providers, provider]}));
        setProviderID(provider.id);
    };

    const save = async () => {
        setSaving(true);
        try {
            await saveAIPlatformConfig(value);
            const config = await getAIPlatformConfig();
            setValue(config);
            setSaved(config);
            message.success("已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const issues = collectIssues(value).map((issue) => ({
        text: issue.text,
        onClick: () => {
            setView(issue.view);
            if (issue.view === "queues") {
                setQueueID(issue.id);
            } else {
                setProviderID(issue.id);
            }
        },
    }));
    const unbound = BUSINESS_DEFINITIONS.filter((definition) => (
        !value.businesses.find((binding) => binding.scene === definition.scene)?.queueID
    )).length;

    return <Flex vertical gap={12}>
        <Tabs
            className="settings-subtabs"
            activeKey={view}
            onChange={(key) => setView(key as AIView)}
            items={[
                {key: "overview", label: <Flex align="center" gap={6}>业务总览{unbound > 0 && <Badge count={unbound} color="orange" size="small"/>}</Flex>},
                {key: "queues", label: "调用策略"},
                {key: "providers", label: "供应商与模型"},
            ]}
        />
        {view === "overview" && <AIBusinessPanel
            value={value}
            onBind={bindBusiness}
            onCreateQueue={createQueueForBusiness}
            onEditQueue={(id) => {
                setQueueID(id);
                setView("queues");
            }}
        />}
        {view === "queues" && <AIQueuePanel
            value={value}
            selectedID={queueID}
            onSelect={setQueueID}
            onAdd={() => addQueue({id: nextID("queue"), name: "新策略", type: "text", items: []})}
            onChange={(id, patch) => update((current) => ({
                ...current,
                queues: current.queues.map((queue) => queue.id === id ? {...queue, ...patch} : queue),
            }))}
            onDelete={(id) => update((current) => ({...current, queues: current.queues.filter((queue) => queue.id !== id)}))}
        />}
        {view === "providers" && <AIProviderPanel
            value={value}
            selectedID={providerID}
            onSelect={setProviderID}
            onAdd={addProvider}
            onChange={(next) => update((current) => ({
                ...current,
                providers: current.providers.map((provider) => provider.id === next.id ? next : provider),
            }))}
            onDelete={(id) => update((current) => ({...current, providers: current.providers.filter((provider) => provider.id !== id)}))}
        />}
        <SaveBar
            changes={collectChanges(saved, value)}
            issues={issues}
            saving={saving}
            onSave={() => void save()}
            onDiscard={() => setValue(saved)}
        />
    </Flex>;
}
