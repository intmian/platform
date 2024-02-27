import {useEffect, useRef, useState} from "react";
import {Button, Checkbox, Form, Input, message, Modal, Select, Space, Spin, Table,} from "antd";
import {sendGetStorage, sendSetStorage} from "../common/sendhttp.js";
import {IsSliceType, ValueType, ValueTypeStr} from "../common/def.js";
import {FormItemArray} from "../common/misc.jsx";
import {DeleteOutlined, FormOutlined} from "@ant-design/icons";

export function ChangeModal({showini, onFinish, isAdd, originData}) {
    const hasOriginData = (originData !== null && originData !== undefined);
    const [typeNow, setTypeNow] = useState(hasOriginData ? originData.type : ValueType.String);
    const [form] = Form.useForm();
    const [show, setShow] = useState(showini);
    if (!show) {
        return null;
    }
    const canChangeKey = isAdd;
    const canChangeType = isAdd;

    let types2 = [];
    for (let key in ValueTypeStr) {
        types2.push({value: key, label: ValueTypeStr[key]});
    }

    return <Modal
        title={isAdd ? "新增" : "修改"}
        open={show}
        onCancel={() => {
            setShow(false);
            onFinish();
        }}
        footer={null}
    >
        <Form
            form={form}
            onFinish={(value) => {
                console.log(value);
                sendSetStorage(value.key, value.value, value.type, (data) => {
                    if (data === null || data.code !== 0) {
                        message.error("操作失败");
                    } else {
                        message.success("操作成功");
                        // 通知下上层不要渲染这个节点了
                        onFinish();
                    }
                    setShow(false);
                })
            }}
        >
            <Form.Item
                label={"键"}
                name="key"
                rules={
                    [
                        {
                            required: true,
                            message: "请输入键"
                        }
                    ]
                }
            >
                <Input
                    disabled={!canChangeKey}
                    defaultValue={hasOriginData ? originData.key : ""}
                />
            </Form.Item>
            <Form.Item
                label={"类型"}
                name="type"
                rules={
                    [
                        {
                            required: true,
                            message: "请选择类型"
                        }
                    ]
                }
            >
                <Select options={types2} disabled={!canChangeType}
                        defaultValue={hasOriginData ? originData.type : types2[0]}
                        onChange={(value) => {
                            console.log(value);
                            setTypeNow(value);
                        }}
                        style={{width: 120}}
                />
            </Form.Item>
            <FormItemArray
                disabled={false}
                form={form}
                isArray={IsSliceType(typeNow)}
                initialValue={hasOriginData ? originData.value : null}
            />
            <Form.Item>
                <Button
                    type={"primary"}
                    htmlType={"submit"}
                >
                    {isAdd ? "新增" : "修改"}
                </Button>
            </Form.Item>
        </Form>

    </Modal>
}

function Header({OnDataChange}) {
    const useRe = useRef(false);
    const [loading, setLoading] = useState(false);
    const [needRefresh, setNeedRefresh] = useState(false);
    useEffect(() => {
        sendGetStorage("", false, (data) => {
            OnDataChange(data);
        })
    }, [needRefresh]);
    // TODO:loading 没有数据 返回0、1正则时，严格正则，严格搜索 模糊搜索 动态增减表单项
    return <Space>
        <Input placeholder="搜索内容"
               onChange={
                   (value) => {
                       if (loading) {
                           return;
                       }
                       let content = value.target.value;
                       setLoading(true);
                       console.log(content);
                       sendGetStorage(content, useRe.current, (data) => {
                           OnDataChange(data);
                           setLoading(false);
                       })
                   }
               }

               style={{width: 200}}
               addonAfter={
                   loading ? <Spin/> : null
               }
        />
        <Checkbox
            onChange={(choose) => {
                useRe.current = choose.target.checked;
            }}
        >
            使用正则
        </Checkbox>
        <Button>
            新增
        </Button>
        <Button onClick={() => {
            setNeedRefresh(true);
        }}>
            刷新
        </Button>
    </Space>
}

function Body({data}) {
    const columns = [
        {
            title: '键',
            dataIndex: 'datakey',
            key: 'datakey',
            width: 175,
        },
        {
            title: '类型',
            dataIndex: 'type',
            key: 'type',
            width: 80
        },
        {
            title: '值',
            dataIndex: 'value',
            key: 'value',
            width: 100
        },
        {
            title: '操作',
            dataIndex: 'operation',
            key: 'operation',
        },
    ];
    // 修改图标和删除图标
    const OprArea = <Space>
        <Button
            shape={"circle"}
        >
            <FormOutlined/>
        </Button>
        <Button
            shape={"circle"}
            danger
        >
            <DeleteOutlined/>
        </Button>
    </Space>
    let data2 = []
    if (data !== null) {
        data = data.result;
        for (let key in data) {
            let typeStr = ValueTypeStr[data[key].Type];
            console.log(key);
            console.log(data[key]);
            data2.push({
                key: key,
                datakey: key,
                type: typeStr,
                value: data[key].Data,
                operation: OprArea
            })
        }
    }
    return <Table dataSource={data2} columns={columns}/>;
}

export function Config() {
    const [data, setData] = useState(null);
    return <div>
        <Space
            direction={"vertical"}
        >
            <Header OnDataChange={(data) => {
                setData(data);
            }}/>
            <Body data={data}/>
        </Space>
    </div>
}