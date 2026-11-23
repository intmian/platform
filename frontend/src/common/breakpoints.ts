import {useSyncExternalStore} from "react";

// 全站唯一的屏幕尺寸判断。只看视口宽度，不看 UA（以前 UA 里带 linux 就会被当成手机）。
export const BP_MOBILE = 768;   // 小于它是手机布局
export const BP_DESKTOP = 1200; // 大于等于它是宽屏

export enum ScreenType {
    Desktop = "desktop",
    SmallDesktop = "small-desktop",
    Mobile = "mobile",
}

function subscribe(cb: () => void) {
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
}

export function getScreenType(width = window.innerWidth): ScreenType {
    if (width < BP_MOBILE) return ScreenType.Mobile;
    if (width < BP_DESKTOP) return ScreenType.SmallDesktop;
    return ScreenType.Desktop;
}

export function useScreenType(): ScreenType {
    return useSyncExternalStore(subscribe, () => getScreenType());
}

export function useIsMobile(): boolean {
    return useScreenType() === ScreenType.Mobile;
}

// 触屏设备（没有悬停能力）。用来决定“鼠标移上去才出现”的按钮要不要常驻
export function isTouchDevice(): boolean {
    return window.matchMedia?.("(hover: none)").matches ?? false;
}
