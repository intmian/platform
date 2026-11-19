import {Button, Card, Flex, Select, Tag, Typography, theme} from "antd";
import {AIPlatformConfig} from "../../common/aiConfig";
import {BUSINESS_DEFINITIONS, findModel, modelDisplayName, modelTypeLabel} from "./aiConfigModel";

const {Text} = Typography;

export function AIBusinessPanel({value, onBind, onCreateQueue, onEditQueue}: {
    value: AIPlatformConfig;
    onBind: (scene: string, queueID: string) => void;
    onCreateQueue: (scene: string) => void;
    onEditQueue: (queueID: string) => void;
}) {
    const {token} = theme.useToken();

    return <Card styles={{body: {padding: 0}}}>
        <div className="ai-business-row ai-business-head" style={{color: token.colorTextSecondary, borderColor: token.colorBorderSecondary}}>
            <span>业务</span>
            <span>调用策略</span>
            <span>调用顺序</span>
            <span/>
        </div>
        {BUSINESS_DEFINITIONS.map((definition) => {
            const queueID = value.businesses.find((binding) => binding.scene === definition.scene)?.queueID ?? "";
            const queue = value.queues.find((candidate) => candidate.id === queueID);
            const options = value.queues
                .filter((candidate) => candidate.type === definition.type)
                .map((candidate) => ({value: candidate.id, label: candidate.name || "未命名策略"}));
            return <div
                key={definition.scene}
                className="ai-business-row"
                style={{
                    borderColor: token.colorBorderSecondary,
                    background: queue ? undefined : token.colorWarningBg,
                }}
            >
                <Text strong>{definition.label}</Text>
                <div className="ai-business-select">
                    {options.length > 0
                        ? <Select
                            style={{width: "100%"}}
                            aria-label={`${definition.label}的调用策略`}
                            placeholder="选择策略"
                            value={queueID || undefined}
                            options={options}
                            onChange={(next: string) => onBind(definition.scene, next)}
                        />
                        : <Button onClick={() => onCreateQueue(definition.scene)}>新建{modelTypeLabel(definition.type)}策略</Button>}
                </div>
                <Flex wrap gap={6} align="center" className="ai-business-chain" style={{minWidth: 0}}>
                    {!queue && <Text type="warning">未配置</Text>}
                    {queue && queue.items.length === 0 && <Text type="danger">这个策略还没有模型</Text>}
                    {queue?.items.map((item, index) => {
                        const model = findModel(value, item.providerID, item.modelID);
                        return <Flex key={`${item.providerID}-${item.modelID}`} align="center" gap={6}>
                            {index > 0 && <Text type="secondary" style={{fontSize: 12}}>失败换</Text>}
                            <Tag bordered={false} color={index === 0 ? "processing" : undefined} style={{marginInlineEnd: 0}}>
                                {model ? modelDisplayName(model) : "未知模型"}
                            </Tag>
                        </Flex>;
                    })}
                </Flex>
                <div className="ai-business-edit">
                    {queue && <Button type="link" size="small" onClick={() => onEditQueue(queue.id)}>编辑</Button>}
                </div>
            </div>;
        })}
    </Card>;
}
