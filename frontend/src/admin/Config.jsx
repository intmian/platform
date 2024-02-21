import {useEffect, useRef, useState} from "react";
import {Button, Checkbox, Input, message, Modal, Select, Space, Spin, Table,} from "antd";
import {sendGetStorage, sendSetStorage} from "../common/sendhttp.js";

const {Search} = Input;

function ChangeModal({showini, onFinish, isAdd, originData}) {
    const [show, setShow] = useState(showini);
    if (!show) {
        return null;
    }
    const canChangeKey = isAdd;
    const canChangeType = isAdd;
    let key = <Input
        disabled={!canChangeKey}
        defaultValue={originData !== null ? originData.key : ""}
    />
    const types = ['字符串', '整数', '浮点', '布尔', '字符串数组', '整数数组', '浮点数组', '布尔数组'];
    let types2 = types.map((item) => {
        return {value: item, label: item}
    })
    let type = <Select options={types2} disabled={!canChangeType}
                       defaultValue={originData !== null ? originData.type : types[0]}/>
    let value = <Input
        disabled={!isAdd}
        defaultValue={originData !== null ? originData.value : ""}
        placeholder="值"
    >
    </Input>
    let button = <Button
        onClick={() => {
            sendSetStorage(key, type.value, value.value, (data) => {
                if (data === null || data.code !== 0) {
                    message.error("操作失败");
                } else {
                    message.success("操作成功");
                    // 通知下上层不要渲染这个节点了
                    onFinish();
                }
                setShow(false);
            })
        }
        }
    >
        {isAdd ? "新增" : "修改"}
    </Button>

    return <Modal>
        <Space>
            {key}
            {type}
            {value}
            {button}
        </Space>
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
    }, [needRefresh, OnDataChange]);
    // TODO:loading 没有数据 返回0、1正则时，严格正则，严格搜索 模糊搜索
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
    const OprArea = <Space>
        <Button>
            修改
        </Button>
        <Button danger={true}>
            删除
        </Button>
    </Space>
    let data2 = []
    if (data !== null) {
        data = data.result;
        for (let key in data) {
            let typeStr = ''
            switch (data[key].Type) {
                case 1:
                    typeStr = '字符串'
                    break;
                case 2:
                    typeStr = '整数'
                    break;
                case 3:
                    typeStr = '浮点'
                    break;
                case 4:
                    typeStr = '布尔'
                    break;
                case 101:
                    typeStr = '字符串数组'
                    break;
                case 102:
                    typeStr = '整数数组'
                    break;
                case 103:
                    typeStr = '浮点数组'
                    break;
                case 104:
                    typeStr = '布尔数组'
                    break;
                default:
                    typeStr = '未知'
                    break;
            }
            data2.push({
                key: key,
                datakey: data[key].Key,
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
        <Header OnDataChange={(data) => {
            setData(data);
        }}/>
        <Body data={data}/>
    </div>
}