import {useRef, useState} from "react";
import {Button, Checkbox, Input, Space, Table} from "antd";
import {sendGetStorage} from "../common/sendhttp.js";

const {Search} = Input;

function Header({OnDataChange}) {
    const useRe = useRef(false);
    const [loading, setLoading] = useState(false);
    return <Space>
        <Search placeholder="搜索内容"
                onSearch={
                    (value) => {
                        setLoading(true);
                        console.log(value);
                        sendGetStorage(value, useRe.current, (data) => {
                            OnDataChange(data);
                            setLoading(false);
                        })
                    }
                }
                style={{width: 200}}
                loading={loading}
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
    </Space>
}

function Body({data}) {
    data = data.result;
    console.log(data);
    const columns = [
        {
            title: '键',
            dataIndex: 'key',
            key: 'key',
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
        <Button>
            删除
        </Button>
    </Space>
    let data2 = []
    for (let key in data) {
        data2.push({
            key: key,
            type: data[key].Type,
            value: data[key].Data,
            operation: OprArea
        })
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