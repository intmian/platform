import {useEffect, useMemo, useState} from "react";
import {Alert, Checkbox, Empty, Flex, Input, Modal, Spin, Tag, Typography} from "antd";
import {listAIProviderModels, type AIProviderConfig} from "../common/aiConfig";

const {Text} = Typography;

// 名字里带这些词的一般不是对话/转写模型（向量、语音合成、图片、审核等），默认隐藏
const NON_CHAT_PATTERN = /embedding|tts|dall-e|image|moderation|realtime|davinci|babbage|sora|computer-use/i;

// 供应商"获取模型"弹窗：拉取上游 /models，勾选后加入该供应商
export function AIModelDiscovery({provider, open, onClose, onAdd}: {
    provider: AIProviderConfig | null;
    open: boolean;
    onClose: () => void;
    onAdd: (modelNames: string[]) => void;
}) {
    const [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [keyword, setKeyword] = useState("");
    const [hideNonChat, setHideNonChat] = useState(true);
    const [selected, setSelected] = useState<string[]>([]);

    // 每次打开重新拉取，避免看到上一个供应商的列表
    useEffect(() => {
        if (!open || !provider) {
            return;
        }
        setModels([]);
        setSelected([]);
        setKeyword("");
        setError("");
        setLoading(true);
        listAIProviderModels(provider)
            .then(setModels)
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
        // 只在打开时拉取；编辑中的 provider 对象每次渲染都会变，不作为依赖
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const existing = useMemo(() => new Set((provider?.models ?? []).map((model) => model.name)), [provider]);
    const visible = models.filter((name) => (
        (!hideNonChat || !NON_CHAT_PATTERN.test(name))
        && name.toLowerCase().includes(keyword.trim().toLowerCase())
    ));

    const toggle = (name: string, checked: boolean) => setSelected((current) => (
        checked ? [...current, name] : current.filter((item) => item !== name)
    ));

    return <Modal
        title={`获取模型${provider ? ` · ${provider.name}` : ""}`}
        open={open}
        onCancel={onClose}
        onOk={() => {
            onAdd(selected);
            onClose();
        }}
        okText={selected.length > 0 ? `添加 ${selected.length} 个` : "添加"}
        okButtonProps={{disabled: selected.length === 0}}
        destroyOnClose
    >
        <Flex vertical gap={12}>
            <Flex gap={12} align="center" wrap>
                <Input.Search
                    allowClear
                    placeholder="搜索模型 ID"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    style={{flex: 1, minWidth: 200}}
                />
                <Checkbox checked={hideNonChat} onChange={(event) => setHideNonChat(event.target.checked)}>
                    隐藏向量、绘图等模型
                </Checkbox>
            </Flex>
            {error && <Alert type="error" showIcon message="获取失败" description={error}/>}
            {loading
                ? <Flex justify="center" style={{padding: 32}}><Spin/></Flex>
                : !error && (visible.length === 0
                    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={models.length === 0 ? "没有可用模型" : "没有匹配的模型"}/>
                    : <div style={{maxHeight: 360, overflowY: "auto"}}>
                        <Flex vertical gap={6}>
                            {visible.map((name) => {
                                const added = existing.has(name);
                                return <Checkbox
                                    key={name}
                                    disabled={added}
                                    checked={added || selected.includes(name)}
                                    onChange={(event) => toggle(name, event.target.checked)}
                                >
                                    <Text code>{name}</Text>
                                    {added && <Tag style={{marginInlineStart: 8}}>已添加</Tag>}
                                </Checkbox>;
                            })}
                        </Flex>
                    </div>)}
            {!loading && models.length > 0 && <Text type="secondary" style={{fontSize: 12}}>
                共 {models.length} 个，显示 {visible.length} 个。添加后默认是文本模型（名字含 transcribe / whisper / asr 的按语音转写），OpenAI 的文本模型默认开启 Web Search，可以再手动调整。
            </Text>}
        </Flex>
    </Modal>;
}
