import {Button, message, Row, Table, Tooltip} from "antd";
import {useEffect, useState} from "react";
import {GetEnvReq, sendGetEnvs, sendSetEnv, SetEnvReq} from "../common/newSendHttp";
import {EnvData} from "../common/backHttpDefine";
import {EditOutlined} from "@ant-design/icons";

export function EnvPanel() {
    const [envs, setEnvs] = useState<EnvData[]>([]);
    useEffect(() => {
        const req = {}
        sendGetEnvs(req as GetEnvReq, (resp) => {
            setEnvs(resp.data.EnvData);
        })
    }, []);
    return <>
        <Row>
            <Button type={"primary"}>test</Button>
        </Row>
        <EnvTable envsIni={envs}/>
    </>
}

function EnvName({name, id, onFinish}: { name: string, id: number, onFinish: (id, name) => void }) {
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(name);

    const handleCopy = () => {
        navigator.clipboard.writeText(id.toString());
    };

    const handleEdit = () => {
        setIsEditing(true);
    };

    const handleBlur = () => {
        const req: SetEnvReq = {EnvID: 0, bindToolID: "", note: "", params: []};
        req.EnvID = id;
        req.note = newName;
        sendSetEnv(req, (ret) => {
            if (!ret.ok) {
                message.error("修改失败");
            } else {
                message.success("修改成功");
            }
            setIsEditing(false);
        });
    };

    return (
        <div>
            <Tooltip title={`点击复制ID: ${id}`}>
                <span onClick={handleCopy}>
                    {isEditing ? (
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onBlur={handleBlur}
                            autoFocus
                        />
                    ) : (
                        <span>{newName}</span>
                    )}
                </span>
            </Tooltip>
            <Button icon={<EditOutlined/>} onClick={handleEdit}/>
        </div>
    );
}

function EnvTable({envsIni}: { envsIni: EnvData[] }) {
    // 为envs生成key
    interface EnvDataWithKey extends EnvData {
        key: string
    }

    const envs = envsIni.map((env) => {
        return {...env, key: env.ID.toString()}
    }) as EnvDataWithKey[];
    const [envCache, setEnvCache] = useState(envs);

    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: EnvDataWithKey) => {
                return <EnvName name={text} id={record.ID} onFinish={(id, name) => {
                    // 修改缓存中的数据
                    const newEnvs = envCache.map((env) => {
                        if (env.ID === id) {
                            return {...env, name: name};
                        }
                        return env;
                    });
                    setEnvCache(newEnvs);
                }}/>
            }
        },
        {
            title: 'Param',
            dataIndex: 'Param',
            key: 'Param',
            render: (text: string[], record: EnvDataWithKey) => {
                return text.join(", ");
            }
        },
        {
            title: 'DefaultToolID',
            dataIndex: 'DefaultToolID',
            key: 'DefaultToolID',
        },
        {
            title: 'Note',
            dataIndex: 'Note',
            key: 'Note',
        },
    ];

    return <Table columns={columns} dataSource={envCache}/>
}