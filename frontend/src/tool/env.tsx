import {useEffect, useState} from "react";
import {Button, Input, message, Space, Table, Tooltip, Typography} from "antd";
import type {ColumnsType} from "antd/es/table";
import {CopyOutlined, EditOutlined} from "@ant-design/icons";
import {EnvData} from "../common/backHttpDefine";
import {getEnvs, setEnvNote} from "./cmdApi";

function EnvNote({env, onSaved}: { env: EnvData; onSaved: (note: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(env.Note);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (draft === env.Note) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await setEnvNote(env, draft);
            onSaved(draft);
            setEditing(false);
        } catch (e) {
            message.error(e instanceof Error ? `修改失败：${e.message}` : "修改失败");
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        return <Input
            size="small"
            value={draft}
            autoFocus
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={() => void save()}
            onBlur={() => void save()}
            style={{maxWidth: 240}}
        />;
    }
    return <Space size={4}>
        <span>{env.Note || <Typography.Text type="secondary">无备注</Typography.Text>}</span>
        <Button type="text" size="small" icon={<EditOutlined/>} onClick={() => {
            setDraft(env.Note);
            setEditing(true);
        }}/>
    </Space>;
}

export function EnvPanel() {
    const [envs, setEnvs] = useState<EnvData[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        getEnvs()
            .then((list) => !cancelled && setEnvs(list))
            .catch((e: Error) => {
                if (cancelled) return;
                message.error(`获取运行环境失败：${e.message}`);
                setEnvs([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const columns: ColumnsType<EnvData> = [
        {
            title: "ID", dataIndex: "ID", key: "ID", width: 90,
            render: (id: number) => <Tooltip title="复制 ID">
                <Button type="text" size="small" icon={<CopyOutlined/>} onClick={() => {
                    void navigator.clipboard.writeText(String(id));
                    message.success("已复制");
                }}>{id}</Button>
            </Tooltip>,
        },
        {
            title: "备注", key: "Note",
            render: (_, env) => <EnvNote env={env} onSaved={(note) => setEnvs((list) => (list ?? []).map((e) => e.ID === env.ID ? {...e, Note: note} : e))}/>,
        },
        {title: "参数", dataIndex: "Param", key: "Param", render: (param: string[] | null) => (param ?? []).join(", ")},
        {title: "默认工具", dataIndex: "DefaultToolID", key: "DefaultToolID"},
    ];

    return <Table<EnvData> rowKey="ID" loading={envs === null} columns={columns} dataSource={envs ?? []} scroll={{x: "max-content"}}/>;
}
