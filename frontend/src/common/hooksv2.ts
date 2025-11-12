import {useEffect, useState} from "react";


export enum ScreenType {
    Desktop = "desktop",
    SmallDesktop = "small-desktop",
    Mobile = "mobile"
}

export function useScreenType(): ScreenType {
    const [screenType, setScreenType] = useState<ScreenType>(ScreenType.Desktop);
    const agents = ['iphone', 'ipad', 'ipod', 'android', 'linux', 'windows phone']; // 所有可能是移动端设备的字段
    const ua = navigator.userAgent.toLowerCase();
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            const isMobileAgent = agents.some(agent => ua.includes(agent));

            if (width < 768 || isMobileAgent) {
                setScreenType(ScreenType.Mobile);
            } else if (width < 1200) {
                setScreenType(ScreenType.SmallDesktop);
            } else {
                setScreenType(ScreenType.Desktop);
            }
        };

        window.addEventListener("resize", handleResize);
        handleResize(); // 初始化时调用一次

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return screenType;
}

function IsMobile(ua: string, width: number): boolean {
    const agents = ['iphone', 'ipad', 'ipod', 'android', 'linux', 'windows phone'];
    const isMobileAgent = agents.some(agent => ua.includes(agent));
    const isMobileWidth = width < 768;
    const isSmallScreen = width < 500;
    return (isMobileWidth && isMobileAgent) || isSmallScreen;
}

export function useIsMobile(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    const iniWidth = window.innerWidth;
    const [isMobile, setIsMobile] = useState(IsMobile(ua, iniWidth));

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setIsMobile(IsMobile(ua, width));
        };

        window.addEventListener("resize", handleResize);
        handleResize();

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return isMobile;
}

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