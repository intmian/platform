import {useEffect, useRef, useState} from "react";
import {Button, Input, InputRef, Tooltip} from "antd";
import {SearchOutlined} from "@ant-design/icons";
import "./custom.css";

/** 统一的关键词：去掉首尾空格、转小写。空串表示没在搜索。 */
export function normKeyword(raw: string): string {
    return raw.trim().toLowerCase();
}

/** 标题或备注里包含关键词就算命中（忽略大小写）。 */
export function textMatch(kw: string, ...texts: (string | undefined | null)[]): boolean {
    if (!kw) return true;
    return texts.some((t) => !!t && t.toLowerCase().includes(kw));
}

/** 把文本里命中关键词的部分标黄。 */
export function Highlight({text, kw}: { text: string, kw: string }) {
    if (!kw || !text) return <>{text}</>;
    const lower = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let from = 0;
    let at = lower.indexOf(kw);
    while (at >= 0) {
        if (at > from) parts.push(text.slice(from, at));
        parts.push(<mark key={at} className="todone-hl">{text.slice(at, at + kw.length)}</mark>);
        from = at + kw.length;
        at = lower.indexOf(kw, from);
    }
    if (from < text.length) parts.push(text.slice(from));
    return <>{parts}</>;
}

/**
 * 搜索框：平时只是一个放大镜按钮，点开变成输入框；清空后失焦会收回按钮。
 * 按 Esc 清空并收起。
 */
export function SearchBox({value, onChange, width = 180}: {
    value: string
    onChange: (v: string) => void
    width?: number
}) {
    const [open, setOpen] = useState(value !== "");
    const ref = useRef<InputRef>(null);
    useEffect(() => {
        if (open) ref.current?.focus();
    }, [open]);
    if (!open) {
        return <Tooltip title="搜索">
            <Button type="text" icon={<SearchOutlined/>} onClick={() => setOpen(true)}/>
        </Tooltip>;
    }
    return <Input
        ref={ref}
        size="small"
        allowClear
        placeholder="搜索标题、备注"
        prefix={<SearchOutlined style={{opacity: 0.45}}/>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
            if (value === "") setOpen(false);
        }}
        onKeyDown={(e) => {
            if (e.key === "Escape") {
                onChange("");
                setOpen(false);
            }
        }}
        style={{width}}
    />;
}
