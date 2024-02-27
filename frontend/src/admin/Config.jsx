import {useCallback, useEffect, useRef, useState} from "react";
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
                initialValue={hasOriginData ? originData.Key : ""}
            >
                <Input
                    disabled={!canChangeKey}
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
                initialValue={hasOriginData ? ValueTypeStr[originData.Type] : types2[0]}
            >
                <Select options={types2} disabled={!canChangeType}
                        onChange={(value) => {
                            setTypeNow(value);
                        }}
                        style={{width: 120}}
                />
            </Form.Item>
            <FormItemArray
                disabled={false}
                form={form}
                isArray={IsSliceType(typeNow)}
                initialValue={hasOriginData ? originData.Data : null}
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
    const [inAdd, setInAdd] = useState(false);
    useEffect(() => {
        sendGetStorage("", false, (data) => {
            OnDataChange(data);
        })
    }, [OnDataChange, needRefresh]);
    // TODO:没有数据 返回0、1正则时，严格正则，严格搜索 模糊搜索
    // 其实应该用一个表单来做，但是当时没想太多，就这样了
    return <Space>
        {inAdd ? <ChangeModal
            showini={true}
            onFinish={() => {
                setInAdd(false);
                setNeedRefresh(true);
            }}
            isAdd={true}>
        </ChangeModal> : null}
        <Input placeholder="搜索内容"
               onChange={
                   (value) => {
                       if (loading) {
                           return;
                       }
                       let content = value.target.value;
                       setLoading(true);
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

function Body({data, onNeedRefresh}) {
    const [inChange, setInChange] = useState(false);
    const OriginData = useRef(null);
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
    let data2 = []
    if (data !== null) {
        data = data.result;
        for (let key in data) {
            let typeStr = ValueTypeStr[data[key].Type];
            data2.push({
                key: key,
                datakey: key,
                type: typeStr,
                value: data[key].Data,
                operation: <Space>
                    <Button
                        shape={"circle"}
                        onClick={() => {
                            OriginData.current = data[key];
                            OriginData.current.Key = key;
                            console.log(OriginData);
                            setInChange(true);
                        }}
                    >
                        <FormOutlined/>
                    </Button>
                    <Button
                        shape={"circle"}
                        danger
                        onClick={() => {
                            sendSetStorage(key, "", data[key].Type, (data) => {
                                console.log(data)
                                if (data === null || data.code !== 0) {
                                    message.error("操作失败");
                                } else {
                                    message.success("操作成功");
                                    onNeedRefresh();
                                }
                            })
                        }}
                    >
                        <DeleteOutlined/>
                    </Button>
                </Space>
            })
        }
    }
    return <>
        {inChange ?
            <ChangeModal
                showini={true}
                onFinish={() => {
                    setInChange(false);
                }}
                isAdd={false}
                originData={OriginData.current}
            /> : null
        }
        <Table dataSource={data2} columns={columns}/>
    </>;
}

export function Config() {
    const [data, setData] = useState(null);
    const OnDataChange = useCallback((data) => {
        setData(data);
    }, [setData]);
    return <div>
        <Space
            direction={"vertical"}
        >
            <Header OnDataChange={OnDataChange}/>
            <Body data={data}/>
        </Space>
    </div>
}