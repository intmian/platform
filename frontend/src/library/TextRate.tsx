import React, {useState} from "react";

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

        setHoverIndex(index);
        setHoverSign(sign);
    };

    const handleClick = (index: number, sign: "+" | "-" | "") => {
        if (!editable) return;
        const newValue = `${sequence[index]}${sign}`;
        setValue(newValue);
        onChange?.(newValue);
    };

    const handleMouseLeave = () => {
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
                            handleClick(i, hoverSign !== null ? hoverSign : "")
                        }
                        style={{
                            fontSize: isActive ? fontSize : fontSize2,
                            color: isActive ? "#333" : "#aaa",
                            cursor: editable ? "pointer" : "default",
                            transition: "all 0.2s ease",
                            fontWeight: isActive ? 600 : 400,
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
