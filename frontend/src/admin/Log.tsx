import {useEffect, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {message, Segmented, Table, Tag} from "antd";
import {ReloadOutlined} from "@ant-design/icons";
import {PageCard, PageHeader} from "../common/PageHeader";
import type {ColumnsType} from "antd/es/table";
import {getLastLogs} from "./adminApi";

export interface LogRow {
    key: number;
    date: string;
    level: string;
    src: string;
    content: string;
}

export const LEVELS: Record<string, { color: string; text: string }> = {
    INFO: {color: "green", text: "信息"},
    ERROR: {color: "red", text: "错误"},
    WARNING: {color: "orange", text: "警告"},
};

// 一行日志形如 "[INFO]\t[2024-01-01 00:00:00]\t[PLAT]\t内容"
export function parseLine(line: string, index: number): LogRow {
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

type LevelFilter = "all" | "problem" | "error";

export function Log() {
    const [rows, setRows] = useState<LogRow[] | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    // 筛选放在地址里，监控页的“最近日志”可以直接带着筛选跳过来
    const [params, setParams] = useSearchParams();
    const level = (["all", "problem", "error"].includes(params.get("level") ?? "") ? params.get("level") : "all") as LevelFilter;

    useEffect(() => {
        let cancelled = false;
        setRows(null);
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
    }, [reloadKey]);

    const shown = (rows ?? []).filter((r) => level === "all"
        || (level === "error" && r.level === "ERROR")
        || (level === "problem" && (r.level === "ERROR" || r.level === "WARNING")));
    const errors = rows?.filter((r) => r.level === "ERROR").length ?? 0;

    return <>
        <PageHeader
            title="日志"
            meta={rows && (errors ? `最近 ${rows.length} 条，其中 ${errors} 条错误` : `最近 ${rows.length} 条`)}
            extra={<Segmented<LevelFilter> value={level} onChange={(v) => setParams(v === "all" ? {} : {level: v}, {replace: true})}
                                           options={[{label: "全部", value: "all"}, {label: "错误和警告", value: "problem"}, {label: "错误", value: "error"}]}/>}
            actions={[{key: "reload", label: "刷新", icon: <ReloadOutlined/>, onClick: () => setReloadKey((k) => k + 1)}]}
        />
        <PageCard flush>
            <Table<LogRow> dataSource={shown} loading={rows === null} columns={columns} scroll={{x: "max-content"}}
                           pagination={{pageSize: 20, hideOnSinglePage: true, showSizeChanger: false}}/>
        </PageCard>
    </>;
}
