import {useState} from "react";
import type {ReactNode} from "react";
import {Button, Input, Tag} from "antd";
import {DeleteOutlined, HolderOutlined, PlusOutlined} from "@ant-design/icons";
import {useAuth} from "../common/loginCtx";
import {useAppTitle} from "../shell/runtime";
import "./money.css";

export function MoneyShell({children}: { children: ReactNode }) {
    return <div className="money-page">
        <main className="money-main">{children}</main>
    </div>;
}

export function PageHeader({title, desc, extra}: { title: string, desc?: string, extra?: ReactNode }) {
    // 页面标题同时作为网页标题
    useAppTitle(title);
    return <div className="money-header">
        <div className="money-title-block">
            <h1>{title}</h1>
            {desc ? <p>{desc}</p> : null}
        </div>
        {extra ? <div className="money-toolbar">{extra}</div> : null}
    </div>;
}

export function useIsAdmin() {
    const loginCtr = useAuth();
    return loginCtr.loginInfo.hasPermission("admin");
}

export function StatusTag({status}: { status: string }) {
    if (status === "confirmed") {
        return <Tag color="success">已确认</Tag>;
    }
    return <Tag color="processing">草稿</Tag>;
}

export function MoneyMetric({label, value}: { label: string, value: string }) {
    return <div className="money-metric">
        <div className="money-metric-label">{label}</div>
        <div className="money-metric-value">{value}</div>
    </div>;
}

export function EditableStringList({
    values,
    onChange,
    placeholder,
    disabled = false,
}: {
    values: string[]
    onChange: (values: string[]) => void
    placeholder: string
    disabled?: boolean
}) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const patch = (index: number, value: string) => {
        onChange(values.map((item, idx) => idx === index ? value : item));
    };
    const remove = (index: number) => {
        onChange(values.filter((_item, idx) => idx !== index));
    };
    const move = (from: number, to: number) => {
        if (from === to || from < 0 || to < 0 || from >= values.length || to >= values.length) {
            return;
        }
        const next = [...values];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
    };
    return <div className="money-list-editor">
        {values.map((value, index) => <div
            className={`money-list-editor-row ${dragIndex === index ? "is-dragging" : ""}`}
            key={index}
            onDragOver={(event) => {
                if (disabled || dragIndex === null) {
                    return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) {
                    move(dragIndex, index);
                }
                setDragIndex(null);
            }}
        >
            <Button
                className="money-list-drag-handle"
                type="text"
                disabled={disabled || values.length < 2}
                icon={<HolderOutlined/>}
                aria-label="拖动排序"
                draggable={!disabled && values.length > 1}
                onDragStart={(event) => {
                    setDragIndex(index);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                }}
                onDragEnd={() => setDragIndex(null)}
            />
            <Input disabled={disabled} value={value} placeholder={placeholder} onChange={(event) => patch(index, event.target.value)}/>
            <Button danger type="text" disabled={disabled} icon={<DeleteOutlined/>} aria-label="删除" onClick={() => remove(index)}/>
        </div>)}
        {!disabled ? <Button icon={<PlusOutlined/>} onClick={() => onChange([...values, ""])}>新增</Button> : null}
    </div>;
}
