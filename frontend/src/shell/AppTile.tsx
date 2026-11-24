import {CSSProperties, useState} from "react";
import {AppDef, findApp, IconTone} from "./apps";

// 桌面上的方块图标。三种来源：
// - 应用：有插画 logo 用图片，没有就用色块 + 图标；
// - 站内快捷方式：用所属应用的颜色，中间写标题的第一个字，右下角挂所属应用的小图标；
// - 站外链接：取对方网站的 favicon，取不到就写首字母。

export function AppGlyph({app, size}: { app: AppDef; size: number }) {
    const {icon} = app;
    if (icon.image) {
        return <span className={`pf-tile tone-${icon.tone}`} style={{width: size, height: size}}>
            <img src={icon.image} alt="" draggable={false}/>
        </span>;
    }
    return <span className={`pf-tile tone-${icon.tone}`} style={{width: size, height: size, fontSize: size * 0.46}}>
        {icon.glyph}
    </span>;
}

export function LinkGlyph({title, url, size}: { title: string; url: string; size: number }) {
    const internal = url.startsWith("/");
    const owner = internal ? findApp(url.split(/[?#]/)[0]) : undefined;
    const letter = Array.from(title.trim())[0] ?? "?";
    if (internal) {
        const tone: IconTone = owner?.icon.tone ?? "gray";
        return <span className={`pf-tile pf-tile-letter tone-${tone}`}
                     style={{width: size, height: size, fontSize: size * 0.42}}>
            {letter}
            {owner && <span className="pf-tile-badge"><AppGlyph app={owner} size={Math.round(size * 0.36)}/></span>}
        </span>;
    }
    return <ExternalGlyph url={url} letter={letter} size={size}/>;
}

function ExternalGlyph({url, letter, size}: { url: string; letter: string; size: number }) {
    const [failed, setFailed] = useState(false);
    let favicon = "";
    try {
        favicon = new URL(url).origin + "/favicon.ico";
    } catch {
        favicon = "";
    }
    const style: CSSProperties = {width: size, height: size, fontSize: size * 0.42};
    if (!favicon || failed) {
        return <span className="pf-tile pf-tile-letter tone-gray" style={style}>{letter.toUpperCase()}</span>;
    }
    return <span className="pf-tile pf-tile-web" style={style}>
        <img src={favicon} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)}
             style={{width: size * 0.5, height: size * 0.5}}/>
    </span>;
}
