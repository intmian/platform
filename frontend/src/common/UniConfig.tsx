import {Button, Collapse, Flex, Input, InputNumber, List, message, Modal, Select, Space, Spin, Switch, Tooltip, Typography} from "antd";
import {ReactNode, useEffect, useRef, useState} from "react";
import {closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors} from "@dnd-kit/core";
import {arrayMove, SortableContext, useSortable, verticalListSortingStrategy} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {CloseOutlined, HolderOutlined, SaveOutlined} from "@ant-design/icons";
import {ConfigsType, ConfigType} from "./UniConfigDef";
import {CfgScope, getCfg, setCfg} from "./cfgApi";

const {Text} = Typography;

// 配置值来自后端 JSON，类型由 uniConfigType 决定
type ConfigValue = unknown;
type SliceItem = string | number | boolean | null;

export interface EnumOption {
    value: string | number;
    label: ReactNode;
}

// 单项配置的描述
export interface ConfigParam {
    key: string;          // 后端的配置 key（不带前缀）
    text: string;         // 显示名
    uniConfigType: number;
    tips: string;
    secret: boolean;      // 机密配置默认隐藏内容
    enum2text: EnumOption[];        // Enum 类型的选项
    buttonFunc: (() => void | Promise<void>) | null;  // Button 类型的点击回调
}

function newParam(key: string, text: string, uniConfigType: number, tips: string, secret = false): ConfigParam {
    return {key, text, uniConfigType, tips, secret, enum2text: [], buttonFunc: null};
}

function ButtonPanel({param}: { param: ConfigParam }) {
    const [operating, setOperating] = useState(false);
    return <Button
        loading={operating}
        onClick={async () => {
            setOperating(true);
            try {
                await param.buttonFunc?.();
            } finally {
                setOperating(false);
            }
        }}
    >{param.text}</Button>;
}

interface MultiItem {
    id: string;
    value: SliceItem;
}

function createMultiInputItems(values: SliceItem[] | null | undefined, idRef: { current: number }): MultiItem[] {
    return (values ?? []).map((item) => ({id: `multi-input-${idRef.current++}`, value: item}));
}

function SortableInputRow({item, editor, onRemove, operating}: {
    item: MultiItem;
    editor: ReactNode;
    onRemove: () => void;
    operating: boolean;
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
        id: item.id,
        disabled: operating,
    });

    return <div
        ref={setNodeRef}
        style={{
            width: "100%",
            transform: CSS.Transform.toString(transform),
            transition: isDragging ? undefined : transition,
            opacity: isDragging ? 0.7 : 1,
            position: "relative",
            zIndex: isDragging ? 1 : undefined,
        }}
    >
        <Flex gap="small" align="center" style={{width: "100%"}}>
            <Button
                {...attributes}
                {...listeners}
                type="text"
                disabled={operating}
                icon={<HolderOutlined/>}
                style={{
                    cursor: operating ? "not-allowed" : "grab",
                    color: "var(--pf-text-3)",
                    touchAction: "none",
                    flexShrink: 0,
                }}
            />
            <div style={{flex: 1, minWidth: 0}}>{editor}</div>
            <Button
                onClick={onRemove}
                type="text"
                danger
                disabled={operating}
                icon={<CloseOutlined/>}
                style={{flexShrink: 0}}
            />
        </Flex>
    </div>;
}

function formatCollapsedValue(value: SliceItem[] | null, secret: boolean): string {
    if (value == null || value.length === 0) return "暂无内容";
    return value.map((item) => {
        if (secret) return "******";
        if (item == null) return "";
        return String(item);
    }).join(", ");
}

function normalizeConfigValueByType(configType: number, value: ConfigValue): ConfigValue {
    if (typeof value !== "string") return value;

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return value;
    }

    switch (configType) {
        case ConfigType.String:
        case ConfigType.Enum:
            return typeof parsed === "string" ? parsed : value;
        case ConfigType.Bool:
            return typeof parsed === "boolean" ? parsed : value;
        case ConfigType.Int:
        case ConfigType.Float:
            return typeof parsed === "number" ? parsed : value;
        case ConfigType.SliceBool:
        case ConfigType.SliceInt:
        case ConfigType.SliceFloat:
        case ConfigType.SliceString:
            return Array.isArray(parsed) ? parsed : value;
        default:
            return value;
    }
}

function MultiInput({defaultValue, onValueChange, operating, type, secret}: {
    defaultValue: SliceItem[] | null;
    onValueChange: (value: SliceItem[]) => void;
    operating: boolean;
    type: number;
    secret: boolean;
}) {
    const idRef = useRef(0);
    const [items, setItems] = useState(() => createMultiInputItems(defaultValue, idRef));
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));

    useEffect(() => {
        setItems(createMultiInputItems(defaultValue, idRef));
    }, [defaultValue]);

    const updateItems = (nextItems: MultiItem[]) => {
        setItems(nextItems);
        onValueChange(nextItems.map((item) => item.value));
    };

    const setItemValue = (index: number, value: SliceItem) => {
        const nextItems = [...items];
        nextItems[index] = {...nextItems[index], value};
        updateItems(nextItems);
    };

    const inputStyle = {flex: 1};
    const rows = items.map((item, i) => {
        let editor: ReactNode = null;
        switch (type) {
            case ConfigType.SliceBool:
                editor = <Switch checked={Boolean(item.value)} onChange={(v) => setItemValue(i, v)} disabled={operating}/>;
                break;
            case ConfigType.SliceInt:
            case ConfigType.SliceFloat:
                editor = <InputNumber
                    style={inputStyle}
                    value={typeof item.value === "number" ? item.value : null}
                    onChange={(v) => setItemValue(i, v)}
                    disabled={operating}
                />;
                break;
            case ConfigType.SliceString: {
                const Comp = secret ? Input.Password : Input;
                editor = <Comp
                    style={inputStyle}
                    value={item.value == null ? "" : String(item.value)}
                    onChange={(e) => setItemValue(i, e.target.value)}
                    disabled={operating}
                />;
                break;
            }
        }
        return <SortableInputRow
            key={item.id}
            item={item}
            editor={editor}
            operating={operating}
            onRemove={() => {
                const nextItems = [...items];
                nextItems.splice(i, 1);
                updateItems(nextItems);
            }}
        />;
    });

    let defaultNew: SliceItem = null;
    switch (type) {
        case ConfigType.SliceBool:
            defaultNew = false;
            break;
        case ConfigType.SliceInt:
        case ConfigType.SliceFloat:
            defaultNew = 0;
            break;
        case ConfigType.SliceString:
            defaultNew = "";
            break;
    }

    const handleDragEnd = ({active, over}: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        updateItems(arrayMove(items, oldIndex, newIndex));
    };

    return <Collapse
        bordered={false}
        size="small"
        style={{width: "100%", minWidth: 0}}
        items={[{
            key: "1",
            label: <div style={{width: "100%", minWidth: 0, overflow: "hidden"}}>
                <Text ellipsis style={{display: "block", width: "100%"}}>
                    {formatCollapsedValue(items.map((item) => item.value), secret)}
                </Text>
            </div>,
            children: <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                    <Space direction="vertical" style={{width: "100%"}}>
                        {rows}
                        <Button
                            onClick={() => updateItems([...items, {id: `multi-input-${idRef.current++}`, value: defaultNew}])}
                            type="dashed"
                            style={{width: "100%"}}
                        >添加一项</Button>
                    </Space>
                </SortableContext>
            </DndContext>,
        }]}
    />;
}

function ShowControlSavePanel({configs, initValue, param, initLoading, titleLength, hideLabel}: {
    configs: ConfigsCtr;
    initValue: ConfigValue;
    param: ConfigParam;
    initLoading: boolean;
    titleLength: number;
    hideLabel: boolean;
}) {
    const [operating, setOperating] = useState(false);
    const [value, setValue] = useState<ConfigValue>(initValue);
    const [needSave, setNeedSave] = useState(false);

    useEffect(() => {
        setValue(initValue);
        setNeedSave(false);
    }, [initValue]);

    let head: ReactNode = <Text>{param.text}:</Text>;
    if (param.tips !== "") {
        head = <Tooltip title={param.tips}>{head}</Tooltip>;
    }

    const onValueChange = (newValue: ConfigValue) => {
        setNeedSave(true);
        setValue(newValue);
    };

    let body: ReactNode = null;
    if (initLoading) {
        body = <Spin/>;
    } else {
        switch (param.uniConfigType) {
            case ConfigType.Bool:
                body = <Switch checked={Boolean(value)} onChange={onValueChange} disabled={operating}/>;
                break;
            case ConfigType.String: {
                const Comp = param.secret ? Input.Password : Input;
                body = <Comp
                    value={value == null ? "" : String(value)}
                    onChange={(e) => onValueChange(e.target.value)}
                    disabled={operating}
                />;
                break;
            }
            case ConfigType.Enum:
                body = <Select
                    value={value as string | number | undefined}
                    options={param.enum2text}
                    onChange={onValueChange}
                    disabled={operating}
                    style={{width: "100%", minWidth: 220}}
                />;
                break;
            case ConfigType.Int:
            case ConfigType.Float:
                body = <InputNumber
                    value={typeof value === "number" ? value : null}
                    onChange={onValueChange}
                    disabled={operating}
                />;
                break;
            case ConfigType.SliceBool:
            case ConfigType.SliceInt:
            case ConfigType.SliceFloat:
            case ConfigType.SliceString:
                body = <MultiInput
                    defaultValue={Array.isArray(initValue) ? initValue as SliceItem[] : null}
                    onValueChange={onValueChange}
                    operating={operating}
                    type={param.uniConfigType}
                    secret={param.secret}
                />;
                break;
        }
    }

    const save = async () => {
        setOperating(true);
        try {
            await setCfg(configs.scope(), param.key, JSON.stringify(value));
            message.success("已保存");
            setNeedSave(false);
            configs.set(param.key, value);
        } catch (e) {
            message.error(e instanceof Error ? `保存失败：${e.message}` : "保存失败");
        } finally {
            setOperating(false);
        }
    };

    return <Flex style={{width: "100%"}} gap="small">
        {hideLabel ? null : <div style={{
            width: titleLength + 0.5 + "em",
            minWidth: titleLength + 0.5 + "em",
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            height: 32,
        }}>{head}</div>}
        <div style={{flex: 1, minWidth: 0, overflow: "hidden"}}>{body}</div>
        <div style={{flexShrink: 0}}>
            <Button onClick={() => void save()} loading={operating} disabled={!needSave} icon={<SaveOutlined/>}/>
        </div>
    </Flex>;
}

// 单项配置的面板：加载中显示转圈，否则显示值并可以修改、单独保存
export function ConfigPanel({configs, param, initLoading, initValue, titleLength, hideLabel = false}: {
    configs: ConfigsCtr;
    param: ConfigParam;
    initLoading: boolean;
    initValue: ConfigValue;
    titleLength: number;
    hideLabel?: boolean;
}) {
    if (param.uniConfigType === ConfigType.Button) {
        return <ButtonPanel param={param}/>;
    }
    return <ShowControlSavePanel
        titleLength={titleLength}
        configs={configs}
        initValue={initValue}
        param={param}
        initLoading={initLoading}
        hideLabel={hideLabel}
    />;
}

type DataListener = (isInit: boolean) => void;

// 一组配置（平台 / 某服务 / 某服务下某用户）的描述和缓存
export class ConfigsCtr {
    cfgMode: ConfigsType;
    configs: ConfigParam[] = [];
    data: Record<string, ConfigValue> = {};
    onDataChanged = new Set<DataListener>();
    server: string;
    user: string;
    needInit = true;
    initPromise: Promise<void> | null = null;

    constructor(cfgMode: ConfigsType, server = "", user = "") {
        this.cfgMode = cfgMode;
        this.server = server;
        this.user = user;
    }

    scope(): CfgScope {
        switch (this.cfgMode) {
            case ConfigsType.Server:
                return {server: this.server};
            case ConfigsType.User:
                return {server: this.server, user: this.user};
            default:
                return {};
        }
    }

    private has(key: string): boolean {
        return this.configs.some((c) => c.key === key);
    }

    private param(key: string): ConfigParam | undefined {
        return this.configs.find((c) => c.key === key);
    }

    addBaseConfig(key: string, text: string, uniConfigType: number, tips: string, options: { secret?: boolean } = {}) {
        if (this.has(key)) return;
        this.configs.push(newParam(key, text, uniConfigType, tips, options.secret ?? false));
    }

    addEnumConfig(key: string, text: string, enum2text: EnumOption[], tips: string, options: { secret?: boolean } = {}) {
        if (this.has(key)) return;
        const param = newParam(key, text, ConfigType.Enum, tips, options.secret ?? false);
        param.enum2text = enum2text;
        this.configs.push(param);
    }

    addCallback(f: DataListener): () => void {
        this.onDataChanged.add(f);
        return () => {
            this.onDataChanged.delete(f);
        };
    }

    private callBack(isInit: boolean) {
        this.onDataChanged.forEach((f) => f(isInit));
    }

    // 读配置的值；没有登记过的 key 返回 null
    get(key: string): ConfigValue {
        if (!this.has(key)) return null;
        return this.data[this.getRealID(key)];
    }

    getRealID(key: string): string {
        switch (this.cfgMode) {
            case ConfigsType.Server:
                return this.server + "." + key;
            case ConfigsType.User:
                return this.server + "." + this.user + "." + key;
            default:
                return "PLAT." + key;
        }
    }

    // 只改本地缓存（保存成功后调用）
    set(key: string, value: ConfigValue) {
        const param = this.param(key);
        this.data[this.getRealID(key)] = param ? normalizeConfigValueByType(param.uniConfigType, value) : value;
        this.callBack(false);
    }

    init(): Promise<void> {
        if (!this.needInit) return Promise.resolve();
        if (this.initPromise !== null) return this.initPromise;

        this.initPromise = getCfg(this.scope())
            .catch(() => ({} as Awaited<ReturnType<typeof getCfg>>))
            .then((values) => {
                // 后端给的就是真实 key；全部写完再触发一次回调，避免重复渲染
                for (const key in values) {
                    this.data[key] = values[key]?.Data;
                }
                this.needInit = false;
                this.initPromise = null;
                this.callBack(true);
            });
        return this.initPromise;
    }
}

// 通用配置界面，用于显示和修改一组配置
export function UniConfig({configCtr, configKeys = null, hideLabels = false}: {
    configCtr: ConfigsCtr;
    configKeys?: string[] | null;
    hideLabels?: boolean;
}) {
    const [loading, setLoading] = useState(true);
    const [, setVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(configCtr.needInit);
        configCtr.init().finally(() => {
            if (!cancelled) setLoading(false);
        });
        const removeCallback = configCtr.addCallback(() => {
            if (!cancelled) setVersion((prev) => prev + 1);
        });
        return () => {
            cancelled = true;
            removeCallback();
        };
    }, [configCtr]);

    const filtered = configKeys === null
        ? configCtr.configs
        : configCtr.configs.filter((item) => configKeys.includes(item.key));

    // 标题宽度按 em 估算：中文算 1，其他字符算 0.5
    let maxTitleLength = 0;
    for (const item of filtered) {
        let len = 0;
        for (let j = 0; j < item.text.length; j++) {
            len += item.text.charCodeAt(j) > 255 ? 1 : 0.5;
        }
        maxTitleLength = Math.max(maxTitleLength, len);
    }

    const panels = filtered.map((item) => {
        const raw = configCtr.data[configCtr.getRealID(item.key)];
        const value = raw === undefined ? null : normalizeConfigValueByType(item.uniConfigType, raw);
        return <ConfigPanel
            key={item.key}
            configs={configCtr}
            param={item}
            initLoading={loading}
            initValue={value}
            titleLength={maxTitleLength}
            hideLabel={hideLabels}
        />;
    });

    return <List dataSource={panels} renderItem={(item) => <List.Item>{item}</List.Item>}/>;
}

export function UniConfigModal({name, ctr, onExit, show}: {
    name: string;
    ctr: ConfigsCtr;
    onExit: () => void;
    show: boolean;
}) {
    return <Modal title={name} open={show} footer={null} maskClosable onCancel={onExit}>
        <UniConfig configCtr={ctr}/>
    </Modal>;
}
