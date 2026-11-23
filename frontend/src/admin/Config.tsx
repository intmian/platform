import {useCallback, useEffect, useMemo, useState} from "react";
import {Button, Checkbox, Flex, Form, Input, message, Modal, Popconfirm, Select, Space, Table} from "antd";
import type {ColumnsType} from "antd/es/table";
import {DeleteOutlined, FormOutlined, ReloadOutlined} from "@ant-design/icons";
import {IsSliceType, Str2Unit, ValueType, ValueTypeStr} from "../common/def";
import {FormItemArray} from "../common/misc";
import {useIsMobile} from "../common/breakpoints";
import {getAllStorage, setStorage, StorageUnit} from "./adminApi";

const TYPE_OPTIONS = Object.entries(ValueTypeStr).map(([value, label]) => ({value: Number(value), label}));

interface EditTarget {
    key: string;
    unit?: StorageUnit;   // 不填表示新增
}

function ChangeModal({target, onClose}: { target: EditTarget; onClose: (changed: boolean) => void }) {
    const isAdd = target.unit === undefined;
    const [type, setType] = useState<number>(target.unit?.Type ?? ValueType.String);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    const submit = async (values: { key: string; value: string | string[] }) => {
        setSaving(true);
        try {
            await setStorage(values.key, Str2Unit(values.value, type), type);
            message.success(isAdd ? "已新增" : "已修改");
            onClose(true);
        } catch (e) {
            message.error(e instanceof Error ? `操作失败：${e.message}` : "操作失败");
        } finally {
            setSaving(false);
        }
    };

    return <Modal title={isAdd ? "新增" : "修改"} open onCancel={() => onClose(false)} footer={null} destroyOnClose>
        <Form form={form} onFinish={submit} initialValues={{key: target.key, type}}>
            <Form.Item label="键" name="key" rules={[{required: true, message: "请输入键"}]}>
                <Input disabled={!isAdd}/>
            </Form.Item>
            <Form.Item label="类型" name="type" rules={[{required: true, message: "请选择类型"}]}>
                <Select options={TYPE_OPTIONS} disabled={!isAdd} onChange={(v: number) => setType(v)} style={{width: 140}}/>
            </Form.Item>
            <FormItemArray form={form} isArray={IsSliceType(type)} initialValue={target.unit?.Data ?? null}/>
            <Form.Item style={{marginBottom: 0}}>
                <Button type="primary" htmlType="submit" loading={saving}>{isAdd ? "新增" : "修改"}</Button>
            </Form.Item>
        </Form>
    </Modal>;
}

// 表格里的值只显示一个缩略
function formatValue(unit: StorageUnit): string {
    let str: string;
    if (unit.Type === ValueType.Bool) {
        str = unit.Data ? "是" : "否";
    } else if (IsSliceType(unit.Type) && Array.isArray(unit.Data)) {
        str = unit.Type === ValueType.SliceBool
            ? unit.Data.map((v) => v ? "是" : "否").join(",")
            : unit.Data.join(",");
    } else {
        str = String(unit.Data ?? "");
    }
    if (str.length > 30) str = str.substring(0, 10) + "...";
    return str.replace(/\n/g, "\\n");
}

interface Row {
    key: string;
    unit: StorageUnit;
}

export function Config() {
    const [data, setData] = useState<Record<string, StorageUnit> | null>(null);
    const [search, setSearch] = useState("");
    const [useRe, setUseRe] = useState(false);
    const [editing, setEditing] = useState<EditTarget | null>(null);
    const isMobile = useIsMobile();

    const load = useCallback(async () => {
        setData(null);
        try {
            setData(await getAllStorage());
        } catch (e) {
            message.error(e instanceof Error ? `获取数据失败：${e.message}` : "获取数据失败");
            setData({});
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const {rows, badRe} = useMemo(() => {
        const keys = Object.keys(data ?? {}).sort();
        if (search === "") return {rows: keys, badRe: false};
        if (!useRe) return {rows: keys.filter((k) => k.includes(search)), badRe: false};
        try {
            const re = new RegExp(search);
            return {rows: keys.filter((k) => re.test(k)), badRe: false};
        } catch {
            return {rows: [], badRe: true};
        }
    }, [data, search, useRe]);

    const remove = async (key: string, unit: StorageUnit) => {
        try {
            await setStorage(key, "", unit.Type);
            message.success("已删除");
            setData((current) => {
                if (!current) return current;
                const next = {...current};
                delete next[key];
                return next;
            });
        } catch (e) {
            message.error(e instanceof Error ? `删除失败：${e.message}` : "删除失败");
        }
    };

    const columns: ColumnsType<Row> = [
        {title: "键", dataIndex: "key", key: "key", width: isMobile ? undefined : 240},
        {title: "类型", key: "type", width: isMobile ? undefined : 110, render: (_, row) => ValueTypeStr[row.unit.Type] ?? row.unit.Type},
        {title: "值", key: "value", render: (_, row) => formatValue(row.unit)},
        {
            title: "操作", key: "op", width: isMobile ? undefined : 100,
            render: (_, row) => <Space>
                <Button shape="circle" size="small" icon={<FormOutlined/>} onClick={() => setEditing({key: row.key, unit: row.unit})}/>
                <Popconfirm title="删除这个配置项？" okText="删除" okButtonProps={{danger: true}} cancelText="取消"
                            onConfirm={() => void remove(row.key, row.unit)}>
                    <Button shape="circle" size="small" danger icon={<DeleteOutlined/>}/>
                </Popconfirm>
            </Space>,
        },
    ];

    return <>
        <Flex gap={8} wrap="wrap" align="center" style={{marginBottom: 12}}>
            <Input
                placeholder="搜索键"
                allowClear
                value={search}
                status={badRe ? "error" : undefined}
                onChange={(e) => setSearch(e.target.value)}
                style={{width: isMobile ? "100%" : 240}}
            />
            <Checkbox checked={useRe} onChange={(e) => setUseRe(e.target.checked)}>使用正则</Checkbox>
            <Flex gap={8} style={{marginLeft: "auto"}}>
                <Button onClick={() => setEditing({key: ""})}>新增</Button>
                <Button icon={<ReloadOutlined/>} onClick={() => void load()}>刷新</Button>
            </Flex>
        </Flex>
        <Table<Row>
            rowKey="key"
            loading={data === null}
            dataSource={rows.map((key) => ({key, unit: data![key]}))}
            columns={columns}
            scroll={{x: "max-content"}}
        />
        {editing && <ChangeModal target={editing} onClose={(changed) => {
            setEditing(null);
            if (changed) void load();
        }}/>}
    </>;
}
