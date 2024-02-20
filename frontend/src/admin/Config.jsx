import {useRef, useState} from "react";
import {Button, Checkbox, Input, Space} from "antd";
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
            新增 修改
        </Button>
        <Button>
            删除
        </Button>
        <Button>
            刷新
        </Button>
    </Space>
}

function Body({data}) {
    return <div>
        {data}
    </div>
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