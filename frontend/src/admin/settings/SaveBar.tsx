import {useState} from "react";
import {Button, Flex, Popconfirm, Typography, theme} from "antd";

const {Text} = Typography;

export interface SaveBarIssue {
    text: string;
    onClick?: () => void;
}

// 吸底的保存条：显示改了什么、还有什么问题要处理
export function SaveBar({changes, issues, saving, onSave, onDiscard}: {
    changes: string[];
    issues: SaveBarIssue[];
    saving: boolean;
    onSave: () => void;
    onDiscard: () => void;
}) {
    const [showChanges, setShowChanges] = useState(false);
    const {token} = theme.useToken();

    if (changes.length === 0 && issues.length === 0) {
        return null;
    }

    return <div
        className="settings-savebar"
        style={{
            background: token.colorBgElevated,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
        }}
    >
        <Flex justify="space-between" align="center" gap={12} wrap>
            <Flex align="center" gap={8} wrap>
                <Text>{changes.length} 处未保存的修改</Text>
                {changes.length > 0 && <Button type="link" size="small" onClick={() => setShowChanges(!showChanges)}>
                    {showChanges ? "收起" : "查看"}
                </Button>}
                {issues.length > 0 && <Text type="danger">还有 {issues.length} 个问题要处理</Text>}
            </Flex>
            <Flex gap={8}>
                <Popconfirm title="放弃所有未保存的修改？" okText="放弃修改" okButtonProps={{danger: true}} cancelText="取消" onConfirm={onDiscard}>
                    <Button>放弃修改</Button>
                </Popconfirm>
                <Button type="primary" loading={saving} disabled={issues.length > 0} onClick={onSave}>保存</Button>
            </Flex>
        </Flex>
        {issues.length > 0 && <Flex vertical align="flex-start" className="settings-savebar-list">
            {issues.map((issue, index) => issue.onClick
                ? <Button key={index} type="link" size="small" danger style={{paddingInline: 0}} onClick={issue.onClick}>{issue.text}</Button>
                : <Text key={index} type="danger">{issue.text}</Text>)}
        </Flex>}
        {showChanges && changes.length > 0 && <Flex vertical gap={4} className="settings-savebar-list">
            {changes.map((change, index) => <Text key={index} type="secondary">{change}</Text>)}
        </Flex>}
    </div>;
}
