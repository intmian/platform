import {useEffect, useState} from "react";

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