import {CSSProperties, ReactNode, useEffect, useRef, useState} from "react";
import {Select} from "antd";
import type {RefSelectProps} from "antd/es/select";

type PinyinFn = (text: string, options: { style: string }) => string[][];

interface TagOption {
    label: string;
    value: string;
    isNew: boolean;
}

function isLowerLatin(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        if (text[i] < "a" || text[i] > "z") return false;
    }
    return true;
}

// 多选标签输入：可以从 tagOps 里选，也可以直接输入新标签。纯小写字母输入时按拼音前缀匹配
export function TagInput({
                             tagOps,
                             tags,
                             onChange,
                             disabled,
                             style,
                             tips = "选择或新增标签",
                             maxTagCount,
                             maxTagTextLength,
                             maxTagPlaceholder,
                             onCtrlEnter,
                             autoFocus = false,
                             focusSignal = 0,
                             open,
                             getPopupContainer,
                         }: {
    tagOps: string[];
    tags?: string[];
    onChange?: (tags: string[]) => void;
    disabled?: boolean;
    style?: CSSProperties;
    tips?: string;
    maxTagCount?: number | "responsive";
    maxTagTextLength?: number;
    maxTagPlaceholder?: ReactNode | ((omitted: { value?: unknown }[]) => ReactNode);
    onCtrlEnter?: () => void;
    autoFocus?: boolean;
    focusSignal?: number;
    open?: boolean;
    getPopupContainer?: (node: HTMLElement) => HTMLElement;
}) {
    const [loading, setLoading] = useState(true);
    const pinyinRef = useRef<PinyinFn | null>(null);
    const selectRef = useRef<RefSelectProps>(null);
    const [inputValue, setInputValue] = useState("");

    useEffect(() => {
        // @ts-expect-error pinyin 包没有类型声明
        import("pinyin").then((mod: { pinyin?: PinyinFn; default?: { pinyin?: PinyinFn } }) => {
            pinyinRef.current = mod.pinyin ?? mod.default?.pinyin ?? null;
        }).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!autoFocus || loading) return;
        const timer = window.setTimeout(() => selectRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [autoFocus, focusSignal, loading]);

    // 已选的标签排在候选项前面，去重
    const all: string[] = [];
    for (const tag of [...(tags ?? []), ...tagOps]) {
        if (!all.includes(tag)) all.push(tag);
    }
    const options: TagOption[] = all.map((tag) => ({label: tag, value: tag, isNew: false}));
    if (inputValue && !all.includes(inputValue)) {
        options.push({label: inputValue, value: inputValue, isNew: true});
    }

    const toPinyin = (text: string) => pinyinRef.current!(text, {style: "normal"}).join("");

    return <Select<string[], TagOption>
        ref={selectRef}
        mode="multiple"
        disabled={disabled || loading}
        autoFocus={autoFocus && !loading}
        open={open === undefined ? undefined : open && !loading}
        getPopupContainer={getPopupContainer}
        style={style}
        value={tags}
        placeholder={tips}
        searchValue={inputValue}
        onSearch={setInputValue}
        onSelect={() => setInputValue("")}
        onInputKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                onCtrlEnter?.();
            }
        }}
        filterOption={(input, option) => {
            if (!option) return false;
            // 只有纯小写字母才按拼音搜，且只匹配开头，避免候选项太多
            if (!isLowerLatin(input) || pinyinRef.current === null) {
                return option.label.includes(input);
            }
            return toPinyin(option.label).startsWith(toPinyin(input));
        }}
        onChange={(value) => onChange?.(value)}
        options={options}
        optionRender={(option) => <div>
            <span>{option.data.label}</span>
            {option.data.isNew && <span style={{float: "right"}}>新增</span>}
        </div>}
        maxTagCount={maxTagCount}
        maxTagTextLength={maxTagTextLength}
        maxTagPlaceholder={maxTagPlaceholder}
    />;
}

export default TagInput;
