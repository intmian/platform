import {CSSProperties, ReactNode, useState} from "react";
import {AppDef, findApp} from "./apps";

// 桌面上的方块图标。三种来源：
// - 应用：有插画 logo 用图片，没有就用色块 + 图标；
// - 站内快捷方式：直接用所属应用的图标，靠下面的名字区分；
// - 站外链接：自己填的图标地址 > 对方网站的 apple-touch-icon（大图，铺满）> favicon（小图，居中）> 首字母。
// 快捷方式和站外链接左下角都有一个小箭头，表示“这是链接”（桌面、Dock 上才显示，搜索、添加面板里图标太小不加）。

// 插画图标按实际要显示的像素挑尺寸：高清屏上 64px 的图标要 128~192 个像素点，用 192 的图缩会发软，直接用 512 的。
// 图标文件会被浏览器缓存，大一点只影响第一次加载。
function iconSrc(image: string, size: number) {
    const px = size * (window.devicePixelRatio || 1);
    const want = px <= 40 ? 64 : px <= 96 ? 192 : 512;
    return image.replace(/-192\.png$/, `-${want}.png`);
}

export function AppGlyph({app, size, children}: { app: AppDef; size: number; children?: ReactNode }) {
    const {icon} = app;
    if (icon.image) {
        return <span className={`pf-tile tone-${icon.tone}`} style={{width: size, height: size}}>
            <img src={iconSrc(icon.image, size)} alt="" draggable={false}/>
            {children}
        </span>;
    }
    return <span className={`pf-tile tone-${icon.tone}`} style={{width: size, height: size, fontSize: size * 0.46}}>
        {icon.glyph}
        {children}
    </span>;
}

const MARK_MIN_SIZE = 40;

// 链接角标：白底小圆 + 往外指的箭头。放在方块里面（编辑时跟着一起晃、悬停时一起浮起），避开右上角的逾期角标
function LinkMark({size}: { size: number }) {
    if (size < MARK_MIN_SIZE) return null;
    const d = Math.round(size * 0.3);
    return <span className="pf-link-mark" style={{width: d, height: d}}>
        <svg viewBox="0 0 24 24" width={d * 0.62} height={d * 0.62} fill="none" stroke="currentColor"
             strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M9 7h8v8"/>
        </svg>
    </span>;
}

export function LinkGlyph({title, url, icon, size}: { title: string; url: string; icon?: string; size: number }) {
    const internal = url.startsWith("/");
    const owner = internal ? findApp(url.split(/[?#]/)[0]) : undefined;
    const letter = Array.from(title.trim())[0] ?? "?";
    if (internal && owner) {
        return <AppGlyph app={owner} size={size}><LinkMark size={size}/></AppGlyph>;
    }
    if (internal) {
        return <span className="pf-tile pf-tile-letter tone-gray"
                     style={{width: size, height: size, fontSize: size * 0.42}}>{letter}<LinkMark size={size}/></span>;
    }
    return <ExternalGlyph key={`${url}|${icon ?? ""}`} url={url} icon={icon} letter={letter} size={size}/>;
}

function ExternalGlyph({url, icon, letter, size}: { url: string; icon?: string; letter: string; size: number }) {
    const candidates: { src: string; full: boolean }[] = [];
    if (icon) candidates.push({src: icon, full: true});
    try {
        const origin = new URL(url).origin;
        candidates.push({src: origin + "/apple-touch-icon.png", full: true}, {src: origin + "/favicon.ico", full: false});
    } catch {
        // 网址不对就只剩首字母
    }
    // 依次试，加载失败换下一个。图片加载出来之前先显示首字母
    // （连不上的地址，比如内网，请求会一直挂着，不先垫一个就是一块空白）
    const [tried, setTried] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const style: CSSProperties = {width: size, height: size, fontSize: size * 0.42};
    const cur = candidates[tried];
    const next = () => {
        setLoaded(false);
        setTried((t) => t + 1);
    };
    const img = cur && <img key={cur.src} src={cur.src} alt="" draggable={false} referrerPolicy="no-referrer"
                            className={loaded ? undefined : "is-loading"}
                            style={cur.full ? undefined : {width: size * 0.5, height: size * 0.5}}
                            onLoad={() => setLoaded(true)} onError={next}/>;
    // 加载前后用同一个外壳，img 不会被重新挂载
    return <span className={loaded ? "pf-tile pf-tile-web" : "pf-tile pf-tile-letter tone-gray"} style={style}>
        {!loaded && letter.toUpperCase()}
        {img}
        <LinkMark size={size}/>
    </span>;
}
