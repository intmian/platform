import {useEffect, useMemo, useState} from "react";
import {Button, Card, Col, Flex, Input, Modal, Row, Spin, Tag, Typography, message, theme} from "antd";
import {CloseOutlined} from "@ant-design/icons";
import {DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors} from "@dnd-kit/core";
import {SortableContext, arrayMove, rectSortingStrategy, useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {getCfg, setCfg} from "../../common/cfgApi";
import {SaveBar} from "./SaveBar";

const {Text} = Typography;

// 后端用关键词结尾的标记判断暂停；#已废弃 是旧写法，下次保存时统一成 #废弃
const PAUSED_SUFFIX = "#废弃";
const LEGACY_PAUSED_SUFFIX = "#已废弃";
const PLACEHOLDER_KEYWORD = "need input";
// 搜索接口对查询长度有限制，后端会截断到这个长度
const MAX_KEYWORD_LENGTH = 90;

interface Keyword {
    id: string;
    text: string;
    enabled: boolean;
}

interface ConnectionField {
    key: string;
    label: string;
    secret?: boolean;
    url?: boolean;
}

const TODONE_FIELDS: ConnectionField[] = [
    {key: "db.worker_endpoint", label: "Worker 地址", url: true},
    {key: "db.worker_token", label: "Worker Token", secret: true},
];

const R2_FIELDS: ConnectionField[] = [
    {key: "r2.endpoint", label: "Endpoint", url: true},
    {key: "r2.bucket", label: "Bucket"},
    {key: "r2.accessKey", label: "Access Key", secret: true},
    {key: "r2.secretKey", label: "Secret Key", secret: true},
    {key: "r2.web", label: "外部访问地址", url: true},
];

// 配置值可能是原始类型，也可能是 JSON 字符串
function parseStored(value: unknown): unknown {
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function toText(value: unknown): string {
    const parsed = parseStored(value);
    return typeof parsed === "string" ? parsed : String(value ?? "");
}

function parseKeywords(value: unknown): Keyword[] {
    const parsed = parseStored(value);
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed
        .map((item) => String(item).trim())
        .filter((item) => item && item !== PLACEHOLDER_KEYWORD)
        .map((item, index) => {
            const suffix = [LEGACY_PAUSED_SUFFIX, PAUSED_SUFFIX].find((candidate) => item.endsWith(candidate));
            return {
                id: `keyword-${index}`,
                text: suffix ? item.slice(0, -suffix.length).trim() : item,
                enabled: !suffix,
            };
        });
}

function serializeKeywords(keywords: Keyword[]): string[] {
    return keywords.map((keyword) => keyword.enabled ? keyword.text : `${keyword.text}${PAUSED_SUFFIX}`);
}

function KeywordChip({keyword, onToggle, onRemove}: {
    keyword: Keyword;
    onToggle: () => void;
    onRemove: () => void;
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id: keyword.id});
    const {token} = theme.useToken();
    return <span
        ref={setNodeRef}
        className="keyword-chip"
        style={{
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.6 : 1,
            background: keyword.enabled ? token.colorBgContainer : token.colorFillQuaternary,
            borderColor: token.colorBorder,
            borderStyle: keyword.enabled ? "solid" : "dashed",
            borderRadius: token.borderRadius,
        }}
        {...attributes}
        {...listeners}
    >
        <button
            type="button"
            className="keyword-chip-name"
            aria-pressed={!keyword.enabled}
            title={keyword.enabled ? "暂停" : "恢复"}
            style={{
                color: keyword.enabled ? token.colorText : token.colorTextTertiary,
                textDecoration: keyword.enabled ? undefined : "line-through",
            }}
            onClick={onToggle}
        >{keyword.text}</button>
        <Button
            type="text"
            size="small"
            aria-label={`删除 ${keyword.text}`}
            icon={<CloseOutlined style={{fontSize: 10}}/>}
            onClick={onRemove}
        />
    </span>;
}

function ConnectionFields({fields, values, onChange}: {
    fields: ConnectionField[];
    values: Record<string, string>;
    onChange: (key: string, value: string) => void;
}) {
    return <Row gutter={[12, 12]}>
        {fields.map((field) => {
            const Control = field.secret ? Input.Password : Input;
            return <Col xs={24} md={12} key={field.key}>
                <Flex vertical gap={4}>
                    <Text type="secondary" style={{fontSize: 12}}>{field.label}</Text>
                    <Control
                        aria-label={field.label}
                        autoComplete="off"
                        value={values[field.key] ?? ""}
                        onChange={(event) => onChange(field.key, event.target.value)}
                    />
                </Flex>
            </Col>;
        })}
    </Row>;
}

interface BasicValues {
    keywords: Keyword[];
    todone: Record<string, string>;
    r2: Record<string, string>;
}

function fieldIssues(name: string, fields: ConnectionField[], values: Record<string, string>): string[] {
    return fields.flatMap((field) => {
        const value = (values[field.key] ?? "").trim();
        if (!value) {
            return [`${name} ${field.label} 不能为空`];
        }
        return field.url && !/^https?:\/\/\S+$/.test(value) ? [`${name} ${field.label} 不是有效地址`] : [];
    });
}

function fieldChanges(name: string, fields: ConnectionField[], saved: Record<string, string>, current: Record<string, string>): string[] {
    return fields.filter((field) => saved[field.key] !== current[field.key]).map((field) => `${name}：修改 ${field.label}`);
}

function keywordChanges(saved: Keyword[], current: Keyword[]): string[] {
    const changes: string[] = [];
    for (const keyword of current) {
        const before = saved.find((item) => item.id === keyword.id);
        if (!before) {
            changes.push(`新增关键词「${keyword.text}」`);
        } else if (before.enabled !== keyword.enabled) {
            changes.push(`${keyword.enabled ? "恢复" : "暂停"}关键词「${keyword.text}」`);
        }
    }
    for (const keyword of saved) {
        if (!current.some((item) => item.id === keyword.id)) {
            changes.push(`删除关键词「${keyword.text}」`);
        }
    }
    const kept = (list: Keyword[], other: Keyword[]) => list.filter((item) => other.some((candidate) => candidate.id === item.id)).map((item) => item.id).join();
    if (kept(saved, current) !== kept(current, saved)) {
        changes.push("调整关键词顺序");
    }
    return changes;
}

export function BasicSettings({onDirtyChange}: {onDirtyChange: (dirty: boolean) => void}) {
    const [value, setValue] = useState<BasicValues | null>(null);
    const [saved, setSaved] = useState<BasicValues | null>(null);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));

    useEffect(() => {
        Promise.all([
            getCfg({server: "auto"}),
            getCfg({server: "todone"}),
            getCfg(),
        ]).then(([auto, todone, plat]) => {
            const next: BasicValues = {
                keywords: parseKeywords(auto["auto.news.keys"]?.Data),
                todone: Object.fromEntries(TODONE_FIELDS.map((field) => [field.key, toText(todone[`todone.${field.key}`]?.Data)])),
                r2: Object.fromEntries(R2_FIELDS.map((field) => [field.key, toText(plat[`PLAT.${field.key}`]?.Data)])),
            };
            setValue(next);
            setSaved(next);
        }).catch((error: Error) => message.error(`配置加载失败：${error.message}`));
    }, []);

    const dirty = useMemo(() => JSON.stringify(value) !== JSON.stringify(saved), [saved, value]);

    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

    if (!value || !saved) {
        return <Flex justify="center" style={{padding: 48}}><Spin/></Flex>;
    }

    const addKeywords = (raw: string) => {
        const parts = raw.split(/[\n,，、;；]+/).map((item) => item.trim()).filter(Boolean);
        if (parts.length === 0) {
            return;
        }
        const seen = new Set(value.keywords.map((keyword) => keyword.text.toLowerCase()));
        const added: Keyword[] = [];
        let duplicated = 0;
        let tooLong = 0;
        for (const text of parts) {
            if (text.length > MAX_KEYWORD_LENGTH) {
                tooLong += 1;
            } else if (seen.has(text.toLowerCase())) {
                duplicated += 1;
            } else {
                seen.add(text.toLowerCase());
                added.push({id: `keyword-new-${Date.now()}-${added.length}`, text, enabled: true});
            }
        }
        setValue({...value, keywords: [...value.keywords, ...added]});
        setDraft("");
        if (duplicated > 0 || tooLong > 0) {
            message.info([
                added.length > 0 ? `已添加 ${added.length} 个` : "",
                duplicated > 0 ? `${duplicated} 个已存在` : "",
                tooLong > 0 ? `${tooLong} 个超过 ${MAX_KEYWORD_LENGTH} 字` : "",
            ].filter(Boolean).join("，"));
        }
    };

    const onDragEnd = ({active, over}: DragEndEvent) => {
        if (!over || active.id === over.id) {
            return;
        }
        const from = value.keywords.findIndex((keyword) => keyword.id === active.id);
        const to = value.keywords.findIndex((keyword) => keyword.id === over.id);
        setValue({...value, keywords: arrayMove(value.keywords, from, to)});
    };

    const commit = async () => {
        setSaving(true);
        try {
            if (JSON.stringify(value.keywords) !== JSON.stringify(saved.keywords)) {
                await setCfg({server: "auto"}, "news.keys", JSON.stringify(serializeKeywords(value.keywords)));
            }
            for (const field of TODONE_FIELDS) {
                if (value.todone[field.key] !== saved.todone[field.key]) {
                    await setCfg({server: "todone"}, field.key, JSON.stringify(value.todone[field.key]));
                }
            }
            for (const field of R2_FIELDS) {
                if (value.r2[field.key] !== saved.r2[field.key]) {
                    await setCfg({}, field.key, JSON.stringify(value.r2[field.key]));
                }
            }
            setSaved(value);
            message.success("已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const save = () => {
        const endpoint = value.todone["db.worker_endpoint"];
        if (endpoint === saved.todone["db.worker_endpoint"]) {
            void commit();
            return;
        }
        Modal.confirm({
            title: "切换 Todone 数据库？",
            content: <Flex vertical gap={4}>
                <Text style={{overflowWrap: "anywhere"}}>切换到：{endpoint}</Text>
                <Text type="secondary">服务重启时会对新库自动迁移表结构。</Text>
            </Flex>,
            okText: "确认切换",
            okButtonProps: {danger: true},
            cancelText: "取消",
            onOk: commit,
        });
    };

    const enabledCount = value.keywords.filter((keyword) => keyword.enabled).length;
    const isTestDB = /test/i.test(value.todone["db.worker_endpoint"]);
    const changes = [
        ...keywordChanges(saved.keywords, value.keywords),
        ...fieldChanges("Todone", TODONE_FIELDS, saved.todone, value.todone),
        ...fieldChanges("R2", R2_FIELDS, saved.r2, value.r2),
    ];
    const issues = [
        // 列表为空时日报会直接生成失败，全部暂停则正常
        ...(value.keywords.length === 0 ? ["至少保留一个关键词"] : []),
        ...fieldIssues("Todone", TODONE_FIELDS, value.todone),
        ...fieldIssues("R2", R2_FIELDS, value.r2),
    ].map((text) => ({text}));

    return <Flex vertical gap={12}>
        <Card title="日报关键词" extra={<Text type="secondary">{enabledCount} 个启用 · {value.keywords.length - enabledCount} 个暂停</Text>}>
            <Flex vertical gap={12}>
                <Flex gap={8}>
                    <Input
                        aria-label="添加关键词"
                        placeholder="添加关键词，多个用逗号分隔"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onPressEnter={(event) => {
                            if (!event.nativeEvent.isComposing) {
                                addKeywords(draft);
                            }
                        }}
                        onPaste={(event) => {
                            const text = event.clipboardData.getData("text");
                            if (/[\n,，、;；]/.test(text)) {
                                event.preventDefault();
                                addKeywords(draft + text);
                            }
                        }}
                    />
                    <Button onClick={() => addKeywords(draft)}>添加</Button>
                </Flex>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={value.keywords.map((keyword) => keyword.id)} strategy={rectSortingStrategy}>
                        <Flex wrap gap={6}>
                            {value.keywords.map((keyword) => <KeywordChip
                                key={keyword.id}
                                keyword={keyword}
                                onToggle={() => setValue({
                                    ...value,
                                    keywords: value.keywords.map((item) => item.id === keyword.id ? {...item, enabled: !item.enabled} : item),
                                })}
                                onRemove={() => setValue({...value, keywords: value.keywords.filter((item) => item.id !== keyword.id)})}
                            />)}
                        </Flex>
                    </SortableContext>
                </DndContext>
                <Text type="secondary" style={{fontSize: 12}}>点击暂停或恢复，拖动排序</Text>
            </Flex>
        </Card>
        <Card title="Todone 数据库" extra={<Tag color={isTestDB ? undefined : "warning"} style={{marginInlineEnd: 0}}>{isTestDB ? "测试库" : "生产库"}</Tag>}>
            <Flex vertical gap={12}>
                <ConnectionFields
                    fields={TODONE_FIELDS}
                    values={value.todone}
                    onChange={(key, next) => setValue({...value, todone: {...value.todone, [key]: next}})}
                />
                <Text type="secondary" style={{fontSize: 12}}>保存后重启 Todone 服务生效</Text>
            </Flex>
        </Card>
        <Card title="R2 文件存储">
            <ConnectionFields
                fields={R2_FIELDS}
                values={value.r2}
                onChange={(key, next) => setValue({...value, r2: {...value.r2, [key]: next}})}
            />
        </Card>
        <SaveBar changes={changes} issues={issues} saving={saving} onSave={save} onDiscard={() => setValue(saved)}/>
    </Flex>;
}
