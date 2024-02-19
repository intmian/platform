import {List, Spin, Table} from "antd";
import {useEffect, useState} from "react";
import {SendGetLastLog} from "../common/sendhttp.js";

export function Log() {
    const [logData, setLogData] = useState(null);
    useEffect(() => {
        SendGetLastLog((data) => {
            if (data === null) {
                return;
            }
            let rawData = [];
            for (let i = 0; i < data.length; i++) {
                let item = data[i];
                // 根据\t分割
                item = item.split('\t');
                rawData.push({
                    key: i,
                    date: item[1],
                    lv: item[0],
                    src: item[2],
                    content: item[3],
                });
            }
            setLogData(rawData);
            // setData(logData);
        });
    }, []);

    if (logData === null) {
        return <List
            size="big"
            bordered
            dataSource={[<Spin key={0} size="large"/>]}
            renderItem={(item) =>
                <List.Item
                    // 居中
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                    }}>
                    {item}
                </List.Item>}
        />
    }
    const columns = [
        {
            title: '日期',
            dataIndex: 'date',
            key: 'date',
        },
        {
            title: '等级',
            dataIndex: 'lv',
            key: 'lv',
        },
        {
            title: '来源',
            dataIndex: 'src',
            key: 'src',
        },
        {
            title: '内容',
            dataIndex: 'content',
            key: 'content',
        },
    ];
    return <Table dataSource={logData} columns={columns}/>;
}