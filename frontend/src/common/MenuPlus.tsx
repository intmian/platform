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
}

// 当前处在哪个分区：地址里布局路由之后的第一段
export function useSectionKey(): string | undefined {
    const base = useResolvedPath(".").pathname.replace(/\/$/, "");
    const {pathname} = useLocation();
    if (!pathname.startsWith(base)) return undefined;
    const first = pathname.slice(base.length).split("/").filter(Boolean)[0];
    return first === undefined ? undefined : decodeURIComponent(first);
}

export function MenuPlus({items, activeKey, children}: {
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

    const links = items.map((item) => <Link
        key={item.key}
        to={item.key}
        className={(isMobile ? "pf-section-tab" : "pf-section-link") + (item.key === activeKey ? " active" : "")}
        aria-current={item.key === activeKey ? "page" : undefined}
    >
        {!isMobile && item.icon}
        <span>{item.label}</span>
    </Link>);

    if (isMobile) {
        return <div className="pf-section is-mobile">
            <nav className="pf-section-tabs" ref={tabsRef}>{links}</nav>
            <main className="pf-section-main">{children}</main>
        </div>;
    }
    return <div className="pf-section">
        <nav className="pf-section-nav">{links}</nav>
        <main className="pf-section-main">{children}</main>
    </div>;
}
