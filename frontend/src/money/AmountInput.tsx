import {Button, Input, InputNumber, Modal, message} from "antd";
import {CalculatorOutlined} from "@ant-design/icons";
import {centsToYuan, formatMoney, yuanToCents} from "./moneyApi";

function normalizeInputCents(value: number, liability = false) {
    return liability ? -Math.abs(value || 0) : value;
}

function displayInputCents(value: number, liability = false) {
    return liability ? Math.abs(value || 0) : value;
}

function evaluateAmountExpression(expression: string): number | null {
    let index = 0;
    const input = expression.replace(/\s/g, "");
    const peek = () => input[index];
    const consume = (char: string) => {
        if (peek() === char) {
            index += 1;
            return true;
        }
        return false;
    };
    const parseNumber = (): number | null => {
        const start = index;
        while (/\d|\./.test(peek() || "")) {
            index += 1;
        }
        if (start === index) {
            return null;
        }
        const value = Number(input.slice(start, index));
        return Number.isFinite(value) ? value : null;
    };
    const parseFactor = (): number | null => {
        if (consume("+")) {
            return parseFactor();
        }
        if (consume("-")) {
            const value = parseFactor();
            return value === null ? null : -value;
        }
        if (consume("(")) {
            const value = parseExpression();
            if (value === null || !consume(")")) {
                return null;
            }
            return value;
        }
        return parseNumber();
    };
    const parseTerm = (): number | null => {
        let value = parseFactor();
        while (value !== null && (peek() === "*" || peek() === "/")) {
            const op = peek();
            index += 1;
            const right = parseFactor();
            if (right === null || (op === "/" && right === 0)) {
                return null;
            }
            value = op === "*" ? value * right : value / right;
        }
        return value;
    };
    const parseExpression = (): number | null => {
        let value = parseTerm();
        while (value !== null && (peek() === "+" || peek() === "-")) {
            const op = peek();
            index += 1;
            const right = parseTerm();
            if (right === null) {
                return null;
            }
            value = op === "+" ? value + right : value - right;
        }
        return value;
    };
    if (!input) {
        return null;
    }
    const result = parseExpression();
    if (result === null || index !== input.length || !Number.isFinite(result)) {
        return null;
    }
    return result;
}

function openAmountExpressionModal(onChange: (value: number) => void, liability = false) {
    let expression = "";
    let closeModal = () => {};
    const applyExpression = () => {
        const result = evaluateAmountExpression(expression);
        if (result === null) {
            message.error("表达式格式不正确");
            return false;
        }
        onChange(normalizeInputCents(yuanToCents(result), liability));
        return true;
    };
    const modal = Modal.confirm({
        title: "表达式输入",
        content: <Input
            autoFocus
            placeholder="例如：200-90"
            onChange={(event) => {
                expression = event.target.value;
            }}
            onPressEnter={() => {
                if (applyExpression()) {
                    closeModal();
                }
            }}
        />,
        okText: "应用",
        cancelText: "取消",
        autoFocusButton: null,
        onOk: () => {
            if (!applyExpression()) {
                return Promise.reject();
            }
            return undefined;
        },
    });
    closeModal = () => modal.destroy();
}

export function entryAmountInput(value: number, onChange: (value: number) => void, options: { liability?: boolean } = {}) {
    const liability = Boolean(options.liability);
    return <div className="money-amount-editor">
        <InputNumber
            className="money-table-input"
            value={centsToYuan(displayInputCents(value, liability))}
            precision={2}
            controls={false}
            onChange={(next) => onChange(normalizeInputCents(yuanToCents(next), liability))}
        />
        <Button
            className="money-expression-button"
            icon={<CalculatorOutlined/>}
            aria-label="表达式输入"
            onClick={() => openAmountExpressionModal(onChange, liability)}
        />
    </div>;
}

export function displayAmountOrDash(enabled: boolean, value: number) {
    return enabled ? formatMoney(value) : "--";
}
