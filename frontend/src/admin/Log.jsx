import {Table, Tag} from "antd";
import {useEffect, useState} from "react";
import {SendGetLastLog} from "../common/sendhttp.js";

export function Log() {
    const [logData, setLogData] = useState(null);
    let loading = logData === null;
    useEffect(() => {
        SendGetLastLog(async (data) => {
            if (data === null) {
                return;
            }
            let rawData = [];
            for (let i = 0; i < data.length; i++) {
                let item = data[i];
                // 根据\t分割
                item = item.split('\t');
                // 去除首位的[]
                item[1] = item[1].slice(1, -1);
                item[0] = item[0].slice(1, -1);
                switch (item[0]) {
                    case "INFO":
                        item[0] = <Tag color="green">信息</Tag>;
                        break;
                    case "ERROR":
                        item[0] = <Tag color="red">错误</Tag>;
                        break;
                    case "WARNING":
                        item[0] = <Tag color="orange">警告</Tag>;
                        break;
                    default:
                        break;
                }
                item[2] = item[2].slice(1, -1);
                rawData.push({
                    key: i,
                    date: item[1],
                    lv: item[0],
                    src: item[2],
                    content: item[3],
                });
            }
            // 延时0.1s
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            setLogData(rawData);
            // setData(logData);
        });
    }, []);

    const columns = [
        {
            title: '日期',
            dataIndex: 'date',
            key: 'date',
            width: 175,
        },
        {
            title: '等级',
            dataIndex: 'lv',
            key: 'lv',
            width: 80
        },
        {
            title: '来源',
            dataIndex: 'src',
            key: 'src',
            width: 100
        },
        {
            title: '内容',
            dataIndex: 'content',
            key: 'content',
        },
    ];
    return <Table dataSource={logData} loading={loading} columns={columns} scroll={{x: 'max-content'}}/>;
}