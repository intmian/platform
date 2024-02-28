import {useEffect, useState} from "react";
import {Button, Form, Input} from 'antd';
import {MinusCircleOutlined, PlusOutlined} from '@ant-design/icons';

export function TimeFromStart({startTime, width}) {
    // 用于在组件刷新时重新计算时间
    useEffect(() => {
        setPassTime(new Date().getTime() - new Date(startTime).getTime());
    }, [startTime])
    const [passTime, setPassTime] = useState(new Date().getTime() - new Date(startTime).getTime());
    useEffect(() => {
        const interval = setInterval(() => {
            setPassTime(passTime + 1000);
        }, 1000);
        return () => clearInterval(interval);
    }, [passTime])

    // 转换为xx天xx小时xx分xx秒
    let day = Math.floor(passTime / (24 * 3600 * 1000));
    let leave1 = passTime % (24 * 3600 * 1000);
    let hours = Math.floor(leave1 / (3600 * 1000));
    let leave2 = leave1 % (3600 * 1000);
    let minutes = Math.floor(leave2 / (60 * 1000));
    let leave3 = leave2 % (60 * 1000);
    let seconds = Math.floor(leave3 / 1000);
    let str = '';
    // 数字默认两位
    if (day > 0) {
        str += `${day} 天 `;
    }
    if (hours > 0 || str !== '') {
        str += `${hours} 小时 `;
    }
    if (minutes > 0 || str !== '') {
        str += `${minutes} 分 `;
    }
    str += `${seconds} 秒`;
    return <div
        style={{
            width: width,
        }}
    >{str}</div>;
}

export function FormItemArray({disabled, isArray, initialValue, form}) {
    // 使用useEffect钩子来设置表单的初始值
    if (isArray) {
        // 如果是数组，我们假定initialValue也是一个数组
        // 全部转换为字符串
        const newValue = initialValue.map((item) => item.toString());
        form.setFieldsValue({value: newValue || []});
    } else {
        // 如果不是数组，则认为initialValue是一个字符串
        form.setFieldsValue({value: initialValue || ''});
    }
    console.log("render");

    if (!isArray) {
        return (
            <Form.Item name="value" rules={
                [
                    {
                        required: true,
                        message: '至少输入一个值'
                    }
                ]
            }
                       label={"值"}
            >
                <Input placeholder="输入值" disabled={disabled}/>
            </Form.Item>
        );
    }

    return (
        <Form.List name="value"
                   rules={
                       [
                           {
                               required: true,
                               message: '至少输入一个值'
                           }
                       ]
                   }
        >
            {(fields, {add, remove}) => (
                <>
                    {fields.map((field) => (
                        <Form.Item key={field.key}

                        >
                            <Form.Item {...field} noStyle
                                       rules={[{required: true, message: '请输入值'}]}
                            >
                                <Input
                                    placeholder="输入值"
                                    style={{width: '90%'}}
                                    disabled={disabled}
                                />
                            </Form.Item>
                            {!disabled && fields.length > 1 && (
                                <MinusCircleOutlined
                                    onClick={() => remove(field.name)}
                                    style={{margin: '0 8px'}}
                                />
                            )}
                        </Form.Item>
                    ))}
                    {!disabled && (
                        <Form.Item>
                            <Button
                                type="dashed"
                                onClick={() => add()}
                                icon={<PlusOutlined/>}
                            >
                                在数组中添加值
                            </Button>
                        </Form.Item>
                    )}
                </>
            )}
        </Form.List>
    );
}