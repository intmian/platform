import {useEffect, useState} from "react";
import {message, Table, Tag} from "antd";
import type {ColumnsType} from "antd/es/table";
import {getLastLogs} from "./adminApi";

interface LogRow {
    key: number;
    date: string;
    level: string;
    src: string;
    content: string;
}

const LEVELS: Record<string, { color: string; text: string }> = {
    INFO: {color: "green", text: "信息"},
    ERROR: {color: "red", text: "错误"},
    WARNING: {color: "orange", text: "警告"},
};

// 一行日志形如 "[INFO]\t[2024-01-01 00:00:00]\t[PLAT]\t内容"
function parseLine(line: string, index: number): LogRow {
    const parts = line.split("\t");
    const strip = (s: string | undefined) => (s ?? "").replace(/^\[/, "").replace(/]$/, "");
    return {
        key: index,
        level: strip(parts[0]),
        date: strip(parts[1]),
        src: strip(parts[2]),
        content: parts.slice(3).join("\t"),
    };
}

const columns: ColumnsType<LogRow> = [
    {title: "时间", dataIndex: "date", key: "date", width: 175},
    {
        title: "等级", dataIndex: "level", key: "level", width: 80,
        render: (level: string) => {
            const def = LEVELS[level];
            return def ? <Tag color={def.color} bordered={false}>{def.text}</Tag> : level;
        },
    },
    {title: "来源", dataIndex: "src", key: "src", width: 100},
    {title: "内容", dataIndex: "content", key: "content"},
];

export function Log() {
    const [rows, setRows] = useState<LogRow[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        getLastLogs()
            .then((lines) => !cancelled && setRows(lines.map(parseLine)))
            .catch((e: Error) => {
                if (cancelled) return;
                message.error(`日志加载失败：${e.message}`);
                setRows([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return <Table<LogRow> dataSource={rows ?? []} loading={rows === null} columns={columns} scroll={{x: "max-content"}}/>;
}
