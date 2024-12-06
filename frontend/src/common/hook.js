import {useCallback, useEffect, useState} from 'react';

/**
 * 自定义Hook，检测页面是否失去过焦点
 */
export function useAlwaysFocus() {
    // 初始化状态为true
    const [hasFocus, setHasFocus] = useState(true);

    const handleFocus = useCallback(() => {
        // 窗口获得焦点时调用，重置状态为true
        setHasFocus(false);
    }, []);

    const handleBlur = useCallback(() => {
        // 窗口失去焦点时调用，设置状态为false
        setHasFocus(false);
    }, []);

    useEffect(() => {
        // 组件挂载时添加事件监听
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);

        // 组件卸载时移除事件监听
        return () => {
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
        };
    }, [handleFocus, handleBlur]);

    // 返回当前的焦点状态以及一个reset函数用于手动重置状态
    return [hasFocus, () => setHasFocus(true)];
}

export function useLostFocus(callback) {
    const handleBlur = useCallback(() => {
        // 窗口失去焦点时调用，设置状态为false
        callback();
    }, [callback]);

    useEffect(() => {
        // 组件挂载时添加事件监听
        window.addEventListener('blur', handleBlur);

        // 组件卸载时移除事件监听
        return () => {
            window.removeEventListener('blur', handleBlur);
        };
    }, [handleBlur]);
}