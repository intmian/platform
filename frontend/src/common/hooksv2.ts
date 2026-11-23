import {useState} from "react";

// 屏幕尺寸判断统一放在 breakpoints.ts，这里只是转发，旧的导入不用改
export {ScreenType, useScreenType, useIsMobile} from "./breakpoints";

export function useStateWithLocal<T>(localKey: string, initialValue: T): [T, (value: T) => void] {
    const [state, setState] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(localKey);
            // 如果值和初始值相同，就删除
            if (item === JSON.stringify(initialValue)) {
                window.localStorage.removeItem(localKey);
            }
            return item !== null ? JSON.parse(item) : initialValue;
        } catch {
            return initialValue;
        }
    });

    return [state, (value: T) => {
        setState(value);
        try {
            window.localStorage.setItem(localKey, JSON.stringify(value));
        } catch (error) {
            console.error("Error saving to localStorage", error);
        }
    }];
}