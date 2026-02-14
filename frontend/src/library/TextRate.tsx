import React, {useEffect, useMemo, useRef, useState} from "react";

interface TextRateProps {
    sequence: string[]; // 评分序列
    editable?: boolean; // 是否可编辑
    initialValue?: string; // 初始值，如 "普通+" 或 "享受-"
    onChange?: (value: string) => void;
    fontSize?: number;
    fontSize2?: number;
}

const TextRate: React.FC<TextRateProps> = ({
                                               sequence,
                                               editable = true,
                                               initialValue,
                                               onChange,
                                               fontSize = 14,
                                               fontSize2 = 10
                                           }) => {
    const [value, setValue] = useState(initialValue || "");
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [hoverSign, setHoverSign] = useState<"+" | "-" | "" | null>(null);
    const hoverStateRef = useRef<{index: number | null; sign: "+" | "-" | "" | null}>({
        index: null,
        sign: null,
    });

    const itemWidthPx = useMemo(() => {
        const font = `${Math.max(fontSize, fontSize2)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return Math.max(fontSize, fontSize2) * 2.2;
        }
        ctx.font = font;
        let maxWidth = 0;
        for (const label of sequence) {
            maxWidth = Math.max(maxWidth, ctx.measureText(label).width);
            maxWidth = Math.max(maxWidth, ctx.measureText(`${label}+`).width);
            maxWidth = Math.max(maxWidth, ctx.measureText(`${label}-`).width);
        }
        return Math.ceil(maxWidth + 8);
    }, [fontSize, fontSize2, sequence]);

    useEffect(() => {
        setValue(initialValue || "");
    }, [initialValue]);

    const handleMouseMove = (e: React.MouseEvent, index: number) => {
        if (!editable) return;
        const {left, width} = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - left;
        const third = width / 3;

        // ✅ 三等分逻辑
        let sign: "+" | "-" | "" = "";
        if (x < third) sign = "-";
        else if (x > 2 * third) sign = "+";
        else sign = "";

        if (hoverStateRef.current.index !== index || hoverStateRef.current.sign !== sign) {
            hoverStateRef.current = {index, sign};
            setHoverIndex(index);
            setHoverSign(sign);
        }
    };

    const handleClick = (index: number, sign: "+" | "-" | "") => {
        if (!editable) return;
        const newValue = `${sequence[index]}${sign}`;
        setValue(newValue);
        onChange?.(newValue);
    };

    const handleMouseLeave = () => {
        hoverStateRef.current = {index: null, sign: null};
        setHoverIndex(null);
        setHoverSign(null);
    };

    const getDisplay = (index: number) => {
        if (hoverIndex === index && hoverSign !== null)
            return `${sequence[index]}${hoverSign}`;
        if (value.startsWith(sequence[index])) return value;
        return sequence[index];
    };

    const gap = fontSize2 / 2

    return (
        <div
            style={{
                display: "flex",
                gap: gap,
                alignItems: "center",
                userSelect: "none",
                flexWrap: "nowrap",
            }}
        >
            {sequence.map((item, i) => {
                const isActive = value.startsWith(item);
                const displayText = getDisplay(i);

                return (
                    <div
                        key={i}
                        onMouseMove={(e) => handleMouseMove(e, i)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() =>
                            handleClick(i, hoverIndex === i && hoverSign !== null ? hoverSign : "")
                        }
                        style={{
                            fontSize: isActive ? fontSize : fontSize2,
                            color: isActive ? "#333" : "#aaa",
                            cursor: editable ? "pointer" : "default",
                            transition: "font-size 0.2s ease, color 0.2s ease, font-weight 0.2s ease",
                            fontWeight: isActive ? 600 : 400,
                            display: "inline-flex",
                            justifyContent: "center",
                            alignItems: "center",
                            whiteSpace: "nowrap",
                            width: itemWidthPx,
                            flex: "0 0 auto",
                        }}
                    >
                        {displayText}
                    </div>
                );
            })}
        </div>
    );
};

export default TextRate;
