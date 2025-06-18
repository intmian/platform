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

export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false);
    const ua = navigator.userAgent.toLowerCase();
    const agents = ['iphone', 'ipad', 'ipod', 'android', 'linux', 'windows phone']; // 所有可能是移动端设备的字段

    useEffect(() => {
        const handleResize = () => {
            // 如果是移动端设备，或者是小屏幕，就认为是移动端
            const isMobileWidth = window.innerWidth < 768;
            const isMobileAgent = agents.some(agent => ua.includes(agent));
            const isSmallScreen = window.innerWidth < 500;
            setIsMobile((isMobileWidth && isMobileAgent) || isSmallScreen);
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