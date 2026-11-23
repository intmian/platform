import {useEffect, useState} from "react";
import {Button, Form, FormInstance, Input} from "antd";
import {MinusCircleOutlined, PlusOutlined} from "@ant-design/icons";

function formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const day = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    let str = "";
    if (day > 0) str += `${day} 天 `;
    if (hours > 0 || str !== "") str += `${hours} 小时 `;
    if (minutes > 0 || str !== "") str += `${minutes} 分 `;
    return str + `${seconds} 秒`;
}

// 从 startTime 到现在过了多久，每秒刷新
export function TimeFromStart({startTime, width}: { startTime: string; width?: number | string }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const start = new Date(startTime.replace(" ", "T")).getTime();
    return <div style={{width}}>{Number.isNaN(start) ? "-" : formatDuration(now - start)}</div>;
}

// 表单里的“值”字段：普通类型是一个输入框，数组类型是可增减的一组输入框。字段名固定为 value
export function FormItemArray({disabled, isArray, initialValue, form}: {
    disabled?: boolean;
    isArray: boolean;
    initialValue: unknown;
    form: FormInstance;
}) {
    useEffect(() => {
        if (isArray) {
            const list = Array.isArray(initialValue) ? initialValue : [];
            form.setFieldsValue({value: list.map((item) => String(item))});
        } else {
            form.setFieldsValue({value: initialValue === null || initialValue === undefined ? "" : String(initialValue)});
        }
    }, [form, initialValue, isArray]);

    if (!isArray) {
        return <Form.Item name="value" label="值" rules={[{required: true, message: "请输入值"}]}>
            <Input placeholder="输入值" disabled={disabled}/>
        </Form.Item>;
    }

    return <Form.List
        name="value"
        rules={[{
            validator: async (_, value) => {
                if (!value || value.length === 0) throw new Error("至少输入一个值");
            },
        }]}
    >
        {(fields, {add, remove}, {errors}) => <>
            {fields.map((field) => <Form.Item key={field.key}>
                <Form.Item name={field.name} noStyle rules={[{required: true, message: "请输入值"}]}>
                    <Input placeholder="输入值" style={{width: "90%"}} disabled={disabled}/>
                </Form.Item>
                {!disabled && fields.length > 1 && <MinusCircleOutlined
                    onClick={() => remove(field.name)}
                    style={{margin: "0 8px"}}
                />}
            </Form.Item>)}
            {!disabled && <Form.Item>
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined/>}>添加一项</Button>
                <Form.ErrorList errors={errors}/>
            </Form.Item>}
        </>}
    </Form.List>;
}
