import {useCallback, useEffect, useRef, useState} from "react";
import {Button, Checkbox, Form, Input, message, Modal, Popconfirm, Select, Space, Spin, Table,} from "antd";
import {sendGetStorage, sendSetStorage} from "../common/sendhttp.js";
import {IsSliceType, ValueType, ValueTypeStr} from "../common/def.js";
import {FormItemArray} from "../common/misc.jsx";
import {DeleteOutlined, FormOutlined} from "@ant-design/icons";

export function ChangeModal({showini, onFinish, isAdd, originData}) {
    const hasOriginData = (originData !== null && originData !== undefined);
    const [typeNow, setTypeNow] = useState(hasOriginData ? originData.Type : ValueType.String);
    const isSlice = IsSliceType(parseInt(typeNow));
    const [form] = Form.useForm();
    const [show, setShow] = useState(showini);
    useEffect(() => {
        setShow(showini);
    }, [showini]);
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
                sendSetStorage(value.key, value.value, typeNow, (data) => {
                    console.log(data)
                    if (data === null || data.code !== 0) {
                        message.error("操作失败");
                    } else {
                        message.success("操作成功");
                        // 通知下上层不要渲染这个节点了
                    }
                    onFinish();
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
                isArray={isSlice}
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

function GetFilterData(data, perm, useRe) {
    // 如果不启用正则，就进行模糊搜索，如果启用正则，就进行正则的严格搜索，返回筛选后的数据
    // 转化为字符串
    perm = perm.toString();
    let result = {};
    if (perm === "") {
        return data;
    }
    for (let key in data) {
        if (useRe) {
            let re = new RegExp(perm);
            if (re.test(key)) {
                result[key] = data[key];
            }
        } else {
            if (key.indexOf(perm) !== -1) {
                result[key] = data[key];
            }
        }
    }
    return result;
}

function Header({OnDataChange}) {
    const useRe = useRef(false);
    const perm = useRef("");
    const [loading, setLoading] = useState(true);
    const [refreshFlag, setRefreshFlag] = useState(false);
    const [inAdd, setInAdd] = useState(false);
    const OriginData = useRef(null);
    useEffect(() => {
        // 需要刷新了就重新获取数据
        sendGetStorage("", false, (data) => {
            if (data === null || data.code !== 0) {
                message.error("获取数据失败");
                return;
            }
            OriginData.current = data.result;
            const result = GetFilterData(data.result, perm.current, useRe.current);
            OnDataChange(result);
            setLoading(false);
        })
    }, [OnDataChange, refreshFlag]);
    // TODO: 不会刷新，false显示为空白的问题
    // 其实应该用一个表单来做，但是当时没想太多，就这样了
    return <Space>
        {inAdd ? <ChangeModal
            showini={true}
            onFinish={() => {
                setInAdd(false);
                setRefreshFlag(true);
            }}
            isAdd={true}>
        </ChangeModal> : null}
        <Input placeholder="搜索内容"
               onChange={
                   (value) => {
                       perm.current = value.target.value;
                       OnDataChange(GetFilterData(OriginData.current, perm.current, useRe.current));
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
        <Button
            onClick={() => {
                setInAdd(true);
            }}
        >
            新增
        </Button>
        <Button onClick={() => {
            setRefreshFlag(!refreshFlag);
        }}>
            刷新
        </Button>
    </Space>
}

function Body({dataLastGet}) {
    const [inChange, setInChange] = useState(false);
    const OriginData = useRef(null);
    const [data, setData] = useState(dataLastGet);
    useEffect(() => {
        setData(dataLastGet);
    }, [dataLastGet]);
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
        },
        {
            title: '操作',
            dataIndex: 'operation',
            key: 'operation',
            width: 100
        },
    ];
    // 修改图标和删除图标
    let data2 = []
    if (data !== null) {
        for (let key in data) {
            let typeStr = ValueTypeStr[data[key].Type];
            // 如果是布尔，就显示是或者否
            let valueStr = data[key].Data;
            if (data[key].Type === ValueType.Bool) {
                valueStr = data[key].Data ? "是" : "否";
            }
            if (IsSliceType(data[key].Type)) {
                valueStr = data[key].Data.join(",");
                if (valueStr.length > 100) {
                    valueStr = valueStr.substring(0, 10) + "...";
                }
                if (data[key].Type === ValueType.SliceBool) {
                    valueStr = data[key].Data.map((value) => {
                        return value ? "是" : "否";
                    }).join(",");
                }
            }
            data2.push({
                key: key,
                datakey: key,
                type: typeStr,
                value: valueStr,
                operation: <Space>
                    <Button
                        shape={"circle"}
                        onClick={() => {
                            OriginData.current = data[key];
                            OriginData.current.Key = key;
                            setInChange(true);
                        }}
                    >
                        <FormOutlined/>
                    </Button>
                    <Popconfirm
                        title="删除"
                        description="删除这个配置项"
                        onConfirm={() => {
                            sendSetStorage(key, "", data[key].Type, (data) => {
                                if (data === null || data.code !== 0) {
                                    message.error("操作失败");
                                } else {
                                    message.success("操作成功");
                                    // 从data中删除这个键
                                    let newD = {...data};
                                    delete newD[key];
                                    setData(newD);
                                }
                            })
                        }}
                        okText="是"
                        cancelText="否"
                    >
                        <Button
                            shape={"circle"}
                            danger
                        >
                            <DeleteOutlined/>
                        </Button>
                    </Popconfirm>
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
                    let newD = {...data};
                    newD[OriginData.current.Key] = OriginData.current;
                    setData(newD);
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
        <

        >
            <Header OnDataChange={OnDataChange}/>
            <Body dataLastGet={data}/>
        </>
    </div>
}