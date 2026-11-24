import {ReactNode} from "react";
import {Button, Dropdown} from "antd";
import {EllipsisOutlined} from "@ant-design/icons";
import {useIsMobile} from "./breakpoints";
import "./PageHeader.css";

// 分区页面顶部的一行：左边标题 + 一句关键信息，右边这一页的操作。管理后台每一页都用它，保证长得一样。
// 手机上：普通按钮收进右边的“更多”菜单；extra（筛选这类要一直看得见的控件）放到标题下面。

export interface PageAction {
    key: string;
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    primary?: boolean;
    danger?: boolean;
    loading?: boolean;
    disabled?: boolean;
}

export function PageHeader({title, meta, actions = [], extra}: {
    title: ReactNode;
    meta?: ReactNode;
    actions?: PageAction[];
    extra?: ReactNode;
}) {
    const isMobile = useIsMobile();
    const buttons = isMobile
        ? actions.length > 0 && <Dropdown trigger={["click"]} placement="bottomRight" menu={{
            items: actions.map((a) => ({key: a.key, label: a.label, icon: a.icon, danger: a.danger, disabled: a.disabled || a.loading})),
            onClick: ({key}) => actions.find((a) => a.key === key)?.onClick(),
        }}>
            <Button type="text" icon={<EllipsisOutlined/>} aria-label="更多操作"/>
        </Dropdown>
        : actions.map((a) => <Button key={a.key} icon={a.icon} type={a.primary ? "primary" : "default"} danger={a.danger}
                                     loading={a.loading} disabled={a.disabled} onClick={a.onClick}>{a.label}</Button>);

    return <header className="pf-page-head">
        <div className="pf-page-head-row">
            <div className="pf-page-head-text">
                <h2 className="pf-page-title">{title}</h2>
                {meta && <span className="pf-page-meta">{meta}</span>}
            </div>
            <div className="pf-page-actions">
                {!isMobile && extra}
                {buttons}
            </div>
        </div>
        {isMobile && extra && <div className="pf-page-extra">{extra}</div>}
    </header>;
}

// 内容卡片：所有分区页面统一的白底圆角容器
export function PageCard({title, extra, flush, children, className = ""}: {
    title?: ReactNode;
    extra?: ReactNode;
    flush?: boolean;   // 表格这类自己有内边距的内容，卡片不再加
    children: ReactNode;
    className?: string;
}) {
    return <section className={`pf-card${flush ? " is-flush" : ""} ${className}`}>
        {(title || extra) && <div className="pf-card-head">
            <span className="pf-card-title">{title}</span>
            {extra}
        </div>}
        {children}
    </section>;
}
