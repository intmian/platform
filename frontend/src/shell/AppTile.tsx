import {CSSProperties, ReactNode, useState} from "react";
import {AppDef, findApp} from "./apps";

// 桌面上的方块图标。三种来源：
// - 应用：有插画 logo 用图片，没有就用色块 + 图标；
// - 站内快捷方式：直接用所属应用的图标，右下角贴一个写着标题第一个字的小方块，同一应用的几个快捷方式靠它区分；
// - 站外链接：取对方网站的 favicon，取不到就写首字母。

export function AppGlyph({app, size, children}: { app: AppDef; size: number; children?: ReactNode }) {
    const {icon} = app;
    if (icon.image) {
        return <span className={`pf-tile tone-${icon.tone}`} style={{width: size, height: size}}>
            <img src={icon.image} alt="" draggable={false}/>
            {children}
        </span>;
    }
    return <span className={`pf-tile tone-${icon.tone}`} style={{width: size, height: size, fontSize: size * 0.46}}>
        {icon.glyph}
        {children}
    </span>;
}

export function LinkGlyph({title, url, size}: { title: string; url: string; size: number }) {
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
