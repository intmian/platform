import {useEffect, useState} from "react";
import {Form, Input, InputNumber, Switch, Typography} from "antd";

const {Text} = Typography;

export type Props = Record<string, unknown>;

// 把组件的 props 列成表单，字符串、数字、布尔可以直接改
export function EditableProps({initialProps, onChange}: { initialProps: Props; onChange: (props: Props) => void }) {
    const [props, setProps] = useState<Props>(initialProps);

    useEffect(() => {
        onChange(props);
    }, [props, onChange]);

    const set = (key: string, value: unknown) => setProps((prev) => ({...prev, [key]: value}));

    const keys = Object.keys(props).filter((k) => k !== "children");
    if (keys.length === 0) {
        return <Text type="secondary">没有可编辑的属性</Text>;
    }

    return <Form layout="horizontal" size="small">
        {keys.map((key) => {
            const value = props[key];
            let editor;
            if (typeof value === "boolean") {
                editor = <Switch checked={value} onChange={(v) => set(key, v)}/>;
            } else if (typeof value === "number") {
                editor = <InputNumber value={value} onChange={(v) => set(key, v ?? 0)}/>;
            } else if (typeof value === "string") {
                editor = <Input value={value} onChange={(e) => set(key, e.target.value)}/>;
            } else {
                editor = <Text type="secondary">{typeof value}</Text>;
            }
            return <Form.Item key={key} label={`${key} (${typeof value})`}>{editor}</Form.Item>;
        })}
    </Form>;
}
