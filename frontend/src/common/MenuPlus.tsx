import {ReactNode, useEffect, useRef} from "react";
import {Link, useLocation, useResolvedPath} from "react-router-dom";
import {useIsMobile} from "./breakpoints";
import "./MenuPlus.css";

// 应用内的分区导航 + 内容区。桌面是左侧竖排列表，手机是顶部可横向滑动的标签条。
// 每个分区对应一个子路由，切换分区就是跳转地址，所以分区可以固定到桌面、可以前进后退。
//
// 用法：在应用的 <Routes> 里放一个不带 path 的布局路由，element 里渲染 <MenuPlus>，
// 子路由写在它下面，MenuPlus 的 children 传 <Outlet/>。items 的 key 就是子路由的第一段路径。

export interface MenuPlusItem {
    key: string;
    label: ReactNode;
    icon?: ReactNode;
    // 分组名。桌面侧栏里相同分组的排在一起、上面写组名；手机上不显示组名
    group?: string;
}

// 当前处在哪个分区：地址里布局路由之后的第一段
export function useSectionKey(): string | undefined {
    const base = useResolvedPath(".").pathname.replace(/\/$/, "");
    const {pathname} = useLocation();
    if (!pathname.startsWith(base)) return undefined;
    const first = pathname.slice(base.length).split("/").filter(Boolean)[0];
    return first === undefined ? undefined : decodeURIComponent(first);
}

export function MenuPlus({title, logo, footer, items, activeKey, children}: {
    title: string;
    logo?: ReactNode;
    footer?: ReactNode;  // 桌面侧栏最底下（比如当前账号）
    items: MenuPlusItem[];
    activeKey?: string;
    children: ReactNode;
}) {
    const isMobile = useIsMobile();
    const tabsRef = useRef<HTMLElement>(null);

    // 手机上把当前标签滚到可见位置
    useEffect(() => {
        const nav = tabsRef.current;
        const el = nav?.querySelector<HTMLElement>(".active");
        if (!nav || !el) return;
        const left = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
        nav.scrollTo({left: Math.max(0, left), behavior: "smooth"});
    }, [activeKey, isMobile]);

    const link = (item: MenuPlusItem) => <Link
        key={item.key}
        to={item.key}
        className={(isMobile ? "pf-section-tab" : "pf-section-link") + (item.key === activeKey ? " active" : "")}
        aria-current={item.key === activeKey ? "page" : undefined}
    >
        {!isMobile && item.icon}
        <span>{item.label}</span>
    </Link>;

    const head = <div className="pf-section-head">
        {logo}
        <span className="pf-section-title">{title}</span>
    </div>;

    if (isMobile) {
        return <div className="pf-section is-mobile">
            <div className="pf-section-top">
                {head}
                <nav className="pf-section-tabs" ref={tabsRef}>{items.map(link)}</nav>
            </div>
            <main className="pf-section-main">{children}</main>
        </div>;
    }

    // 按分组排：分组按第一次出现的顺序，组内保持原顺序
    const groups: { name?: string; items: MenuPlusItem[] }[] = [];
    items.forEach((item) => {
        const g = groups.find((x) => x.name === item.group);
        if (g) g.items.push(item);
        else groups.push({name: item.group, items: [item]});
    });
    return <div className="pf-section">
        <nav className="pf-section-nav">
            {head}
            {groups.map((g, i) => <div key={g.name ?? i} className="pf-section-group">
                {g.name && <div className="pf-section-group-name">{g.name}</div>}
                {g.items.map(link)}
            </div>)}
            {footer && <div className="pf-section-foot">{footer}</div>}
        </nav>
        <main className="pf-section-main">{children}</main>
    </div>;
}
