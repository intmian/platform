import {useEffect, useRef, useState} from "react";
import {Button, Checkbox, Input, Space, Table} from "antd";
import {sendGetStorage} from "../common/sendhttp.js";

const {Search} = Input;

function Header({OnDataChange}) {
    const useRe = useRef(false);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        sendGetStorage("", false, (data) => {
            OnDataChange(data);
        })
    }, []);
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