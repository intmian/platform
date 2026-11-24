import {useEffect} from "react";
import {theme, ThemeConfig} from "antd";

// 全站主题。antd 组件读 token；普通 CSS 文件读下面写到 :root 上的 --pf-* 变量，不要再写死色值。
export const appTheme: ThemeConfig = {
    token: {
        borderRadius: 8,
        fontFamily: `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif`,
    },
};

// token 名 → CSS 变量名
const VARS: Record<string, string> = {
    colorPrimary: "--pf-primary",
    colorPrimaryBg: "--pf-primary-bg",
    colorPrimaryHover: "--pf-primary-hover",
    colorText: "--pf-text",
    colorTextSecondary: "--pf-text-2",
    colorTextTertiary: "--pf-text-3",
    colorTextQuaternary: "--pf-text-4",
    colorBgContainer: "--pf-bg",
    colorBgLayout: "--pf-bg-layout",
    colorBgElevated: "--pf-bg-elevated",
    colorFillSecondary: "--pf-fill-2",
    colorFillTertiary: "--pf-fill-3",
    colorFillQuaternary: "--pf-fill-4",
    colorBorder: "--pf-border",
    colorBorderSecondary: "--pf-border-2",
    colorSuccess: "--pf-success",
    colorSuccessBg: "--pf-success-bg",
    colorWarning: "--pf-warning",
    colorWarningBg: "--pf-warning-bg",
    colorError: "--pf-error",
    colorErrorBg: "--pf-error-bg",
    colorInfo: "--pf-info",
    colorInfoBg: "--pf-info-bg",
    boxShadowSecondary: "--pf-shadow",
};

export function ThemeVars() {
    const {token} = theme.useToken();
    useEffect(() => {
        const root = document.documentElement.style;
        const t = token as unknown as Record<string, string | number>;
        Object.entries(VARS).forEach(([k, v]) => root.setProperty(v, String(t[k])));
        root.setProperty("--pf-radius", `${token.borderRadius}px`);
        root.setProperty("--pf-radius-lg", `${token.borderRadiusLG}px`);
    }, [token]);
    return null;
}
