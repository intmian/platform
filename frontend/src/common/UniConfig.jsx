import {
    Badge,
    Button,
    Col,
    Flex,
    Input,
    InputNumber,
    List,
    notification,
    Row,
    Select,
    Space,
    Spin,
    Switch,
    Tooltip
} from "antd";
import {useEffect, useState} from "react";
import {ConfigsType, ConfigType} from "./UniConfigDef.js";
import {CloseOutlined, SaveOutlined} from "@ant-design/icons";
import {
    sendCfgPlatGet,
    sendCfgPlatSet,
    sendCfgServiceGet,
    sendCfgServiceSet,
    sendCfgServiceUserGet,
    sendCfgServiceUserSet
} from "./sendhttp.js";

// ConfigParam 配置的参数
class ConfigParam {
    key = '';  // 对应后端的配置key
    text = ''; // 对应的显示文本
    defaultValue = null; // 如果值为null的情况下，显示的值（需要与后端的值对应）
    uniConfigType = 0; // 对应配置类型
    tips = '';  // 详细说明

    // 以下是额外信息，特殊的Type会有特殊的信息
    enum2text = {}  // 如果是enum类型，这里是enum的值和对应的提示
    buttonFunc = null;  // 如果是button类型，这里是点击按钮的回调
}

function enumPanel(ConfigMeta, value, onValueChange, operating) {
    let options = {}
    for (const [enumVar, text] of ConfigMeta.enum2text) {
        options[enumVar] = text
    }
    return <Select
        defaultValue={value}
        onChange={onValueChange}
        disabled={operating}
    />
}

function ButtonPanel({ConfigParam}) {
    const [operating, setOperating] = useState(false);
    return <Button
        onClick={() => {
            setOperating(true)
            ConfigParam.buttonFunc()
            setOperating(false)
        }}
        disabled={operating}
    />
}

function ShowControlSavePanel({configs, InitValue, ConfigParam, InitLoading, cfgMode, server, user}) {
    // 是否正在进行网络操作，内部加载中
    const [operating, setOperating] = useState(false);
    // 当前的值
    const [value, setValue] = useState(InitValue);
    // 是否需要保存
    const [needSave, setNeedSave] = useState(false);

    // 头部
    let head;
    if (ConfigParam.tips !== '') {
        head = <Tooltip title={ConfigParam.tips}>
            <div>{ConfigParam.text}:</div>
        </Tooltip>
    } else {
        head = <div>{ConfigParam.text}:</div>
    }


    // 数据操作区，处理value，并提示保存
    const onValueChange = (newValue) => {
        setNeedSave(true);
        setValue(newValue.target.value);
    }
    let body = null;
    if (InitLoading) {
        body = <Spin/>
    } else {
        // 根据类型显示不同的内容
        switch (ConfigParam.uniConfigType) {
            case ConfigType.Bool:
                body = <Switch
                    defaultChecked={InitValue}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case ConfigType.String:
                body = <Input
                    defaultValue={InitValue}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case ConfigType.Enum:
                // 显示时显示value对应enum2text,选择项也从中取
                body = enumPanel(ConfigParam, InitValue, onValueChange, operating);
                break
            case ConfigType.Int:
            case ConfigType.Float:
                body = <InputNumber
                    defaultValue={InitValue}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case ConfigType.SliceBool:
            case ConfigType.SliceInt:
            case ConfigType.SliceFloat:
            case ConfigType.SliceString:
                body = <MultiInput
                    defaultValue={InitValue}
                    onValueChange={onValueChange}
                    operating={operating}
                    type={ConfigParam.uniConfigType}
                />
                break
        }
    }

    // 保存区
    const [api, contextHolder] = notification.useNotification();
    const openNotificationWithIcon = (type, msg, desc) => {
        api[type]({
            message: msg,
            description: desc,
            duration: 3,
        });
    };
    let foot = <Button
        onClick={() => {
            setOperating(true);
            const newValue = value;
            const callback = (ret) => {
                if (ret.ok) {
                    openNotificationWithIcon('success', '保存成功', '保存成功');
                    setOperating(false);
                    setNeedSave(false);
                    configs.set(ConfigParam.key, newValue);
                } else {
                    openNotificationWithIcon('error', '保存失败', '保存失败');
                    setOperating(false);
                    setNeedSave(true);
                }
            }
            switch (cfgMode) {
                case ConfigsType.Plat:
                    sendCfgPlatSet(ConfigParam.key, newValue, callback)
                    break
                case ConfigsType.Server:
                    sendCfgServiceSet(server, ConfigParam.key, newValue, callback)
                    break
                case ConfigsType.User:
                    sendCfgServiceUserSet(server, user, ConfigParam.key, newValue, callback)
                    break
            }
        }}
        loading={operating}
        disabled={!needSave}
        icon={<SaveOutlined/>}
    >
    </Button>
    return <Flex style={{
        width: '100%',
    }}
                 gap={'small'}
    >
        {contextHolder}
        <div>{head}</div>
        <div style={{flex: 1}}>{body}</div>
        <div>{foot}</div>
    </Flex>
}

/*
* ConfigPanel 单项配置的面板
* ConfigParam 配置的参数
* InitLoading 是否正在初始化
* InitValue 初始化的值
* cfgMode 配置的模式 平台、服务、用户
* server 服务的名字
* user 用户的名字
* 如果正在加载中，会显示加载中的状态，否在会在底层未改变初始值的情况下显示值。
* */
export function ConfigPanel({configs, ConfigParam, InitLoading, InitValue, cfgMode, server, user}) {
    // 特殊处理的一些类型
    if (ConfigParam.uniConfigType === ConfigType.Button) {
        return ButtonPanel(ConfigParam);
    }
    // 通用的展示、控制、保存组件
    return <ShowControlSavePanel
        configs={configs}
        InitValue={InitValue}
        ConfigParam={ConfigParam}
        InitLoading={InitLoading}
        cfgMode={cfgMode}
        server={server}
        user={user}
    />
}

function MultiInput({value, onValueChange, operating, type}) {
    // 一组editor，每个editor右上角有一个删除按钮，点击删除按钮会删除这个editor，后面有一个按钮可以添加新的editor
    let coms = []
    for (let i = 0; i < value.length; i++) {
        let editor = null;
        switch (type) {
            case ConfigType.SliceBool:
                editor = <Switch
                    checked={value[i]}
                    onChange={(newValue) => {
                        value[i] = newValue;
                        onValueChange(value);
                    }}
                    disabled={operating}
                />
                break
            case ConfigType.SliceInt:
            case ConfigType.SliceFloat:
                editor = <InputNumber
                    value={value[i]}
                    onChange={(newValue) => {
                        value[i] = newValue;
                        onValueChange(value);
                    }}
                    disabled={operating}
                />
                break
            case ConfigType.SliceString:
                editor = <Input
                    value={value[i]}
                    onChange={(newValue) => {
                        value[i] = newValue;
                        onValueChange(value);
                    }}
                    disabled={operating}
                />
                break
        }
        coms.push(<Col>
            <Badge
                count={
                    < CloseOutlined
                        style={{fontSize: '20px'}}
                        onClick={() => console.log('删除')}
                    />}
                key={i}>

                {editor}
            </Badge>)
        </Col>)
    }

    let defaultNew = null;
    switch (type) {
        case ConfigType.SliceBool:
            defaultNew = false;
            break
        case ConfigType.SliceInt:
        case ConfigType.SliceFloat:
            defaultNew = 0;
            break
        case ConfigType.SliceString:
            defaultNew = '';
            break
    }
    let adder = <Button
        onClick={() => {
            value.push(defaultNew);
            // 默认添加零值，这里不需要默认值
            onValueChange(value);
        }}
    >添加</Button>

    return <Space>
        <Row style={{overflow: 'auto', width: '100%', height: '100vh'}}>
            {coms}
            {adder}
        </Row>
    </Space>
}

export class ConfigsCtr {
    constructor(cfgMode, server, user) {
        this.configs = [];
        this.cfgMode = cfgMode;
        this.server = server;
        this.user = user;
    }

    cfgMode = ConfigsType.Plat
    configs = []
    data = {}
    onDataChanged = []
    server = ''
    user = ''
    inInit = true

    addBaseConfig(key, text, uniConfigType, tips) {
        for (let i = 0; i < this.configs.length; i++) {
            if (this.configs[i].key === key) {
                return;
            }
        }

        let param = new ConfigParam();
        param.key = key;
        param.text = text;
        param.uniConfigType = uniConfigType
        param.tips = tips;
        this.configs.push(param);
    }

    addCallback(f) {
        this.onDataChanged.push(f);
    }

    callBack() {
        for (let i = 0; i < this.onDataChanged.length; i++) {
            this.onDataChanged[i]();
        }
    }

    get(key) {
        // 判断params中是否有key
        let param;
        for (let i = 0; i < this.configs.length; i++) {
            if (this.configs[i].key === key) {
                param = this.configs[i];
                break;
            }
        }
        if (param === undefined) {
            return null;
        }
        let realKey = this.getRealID(key);
        return this.data[realKey];
    }

    getRealID(key) {
        let realKey;
        switch (this.cfgMode) {
            case ConfigsType.Plat:
                realKey = 'PLAT.' + key;
                break
            case ConfigsType.Server:
                realKey = this.server + '.' + key;
                break
            case ConfigsType.User:
                realKey = this.server + '.' + this.user + '.' + key;
                break
        }
        return realKey;
    }

    setByDB(key, value) {
        this.data[key] = value
    }

    set(key, value) {
        let realKey = this.getRealID(key);
        this.data[realKey] = value;
        this.callBack()
    }

    init() {
        let callback = (ret) => {
            // 后端传的key都是真实key不需要二次处理，所以调用特殊函数，同时为了避免重复渲染，最后触发一次回调。
            for (let key in ret.data) {
                this.setByDB(key, ret.data[key].Data);
            }
            this.inInit = false;
            this.callBack()
        }
        if (this.cfgMode === ConfigsType.Plat) {
            sendCfgPlatGet(callback)
        } else if (this.cfgMode === ConfigsType.Server) {
            sendCfgServiceGet(this.server, callback)
        } else if (this.cfgMode === ConfigsType.User) {
            sendCfgServiceUserGet(this.server, this.user, callback)
        }
    }
}

// UniConfig 一个通用的配置界面，用于显示和修改配置。建议不要和ctx一起耦合，单独处理全局的已有配置
export function UniConfig({configCtr, server = "", user = ""}) {
    // 加载中
    const [loading, setLoading] = useState(true);
    // 配置
    const [configData, setConfigs] = useState(null);

    // 初始化
    useEffect(() => {
        let callback = (ret) => {
            setConfigs(ret.data);
            setLoading(false);
            // 后端传的key都是真实key不需要二次处理，所以调用特殊函数，同时为了避免重复渲染，最后触发一次回调。
            for (let key in ret.data) {
                configCtr.setByDB(key, ret.data[key].Data);
            }
            configCtr.onDataChanged()
        }
        if (configCtr.cfgMode === ConfigsType.Plat) {
            sendCfgPlatGet(callback)
        } else if (configCtr.cfgMode === ConfigsType.Server) {
            sendCfgServiceGet(server, callback)
        } else if (configCtr.cfgMode === ConfigsType.User) {
            sendCfgServiceUserGet(server, user, callback)
        }
    }, [configCtr.cfgMode, configCtr, server, user]);

    // 配置面板
    let panels = [];
    for (let i = 0; i < configCtr.configs.length; i++) {
        let data = null;
        if (configData !== null) {
            let realKey;
            switch (configCtr.cfgMode) {
                case ConfigsType.Plat:
                    realKey = 'PLAT.' + configCtr.configs[i].key;
                    break
                case ConfigsType.Server:
                    realKey = server + '.' + configCtr.configs[i].key;
                    break
                case ConfigsType.User:
                    realKey = server + '.' + user + '.' + configCtr.configs[i].key;
                    break
            }
            if (configData[realKey] !== undefined) {
                data = configData[realKey].Data;
            } else {
                data = null;
            }

        }
        panels.push(<ConfigPanel
            configs={configCtr}
            key={i}
            ConfigParam={configCtr.configs[i]}
            cfgMode={configCtr.cfgMode}
            InitLoading={loading}
            InitValue={data}
        />)
    }
    return <List
        dataSource={panels}
        renderItem={item => (
            <List.Item>
                {item}
            </List.Item>
        )}
    />
}
