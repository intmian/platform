import {CSSProperties, ReactNode, useState} from "react";
import {AppDef, findApp} from "./apps";

// 桌面上的方块图标。三种来源：
// - 应用：有插画 logo 用图片，没有就用色块 + 图标；
// - 站内快捷方式：直接用所属应用的图标，右下角贴一个写着标题第一个字的小方块，同一应用的几个快捷方式靠它区分；
// - 站外链接：自己填的图标地址 > 对方网站的 apple-touch-icon（大图，铺满）> favicon（小图，居中）> 首字母。

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

export function LinkGlyph({title, url, icon, size}: { title: string; url: string; icon?: string; size: number }) {
    const internal = url.startsWith("/");
    const owner = internal ? findApp(url.split(/[?#]/)[0]) : undefined;
    const letter = Array.from(title.trim())[0] ?? "?";
    if (internal && owner) {
        const chip = Math.round(size * 0.4);
        return <AppGlyph app={owner} size={size}>
            <span className={`pf-link-chip tone-${owner.icon.tone}`}
                  style={{width: chip, height: chip, fontSize: Math.round(chip * 0.56)}}>{letter}</span>
        </AppGlyph>;
    }
    if (internal) {
        return <span className="pf-tile pf-tile-letter tone-gray"
                     style={{width: size, height: size, fontSize: size * 0.42}}>{letter}</span>;
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
    // 依次试，加载失败换下一个
    const [tried, setTried] = useState(0);
    const style: CSSProperties = {width: size, height: size, fontSize: size * 0.42};
    const cur = candidates[tried];
    if (!cur) {
        return <span className="pf-tile pf-tile-letter tone-gray" style={style}>{letter.toUpperCase()}</span>;
    }
    const next = () => setTried((t) => t + 1);
    return <span className="pf-tile pf-tile-web" style={style}>
        {cur.full
            ? <img src={cur.src} alt="" draggable={false} referrerPolicy="no-referrer" onError={next}/>
            : <img src={cur.src} alt="" draggable={false} referrerPolicy="no-referrer" onError={next}
                   style={{width: size * 0.5, height: size * 0.5}}/>}
    </span>;
}
