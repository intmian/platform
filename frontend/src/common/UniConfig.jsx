import {
    Badge,
    Button,
    Col,
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
import {ConfigType, UniConfigType} from "./UniConfigDef.js";
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
            case UniConfigType.Bool:
                body = <Switch
                    defaultChecked={InitValue}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case UniConfigType.String:
                body = <Input
                    defaultValue={InitValue}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case UniConfigType.Enum:
                // 显示时显示value对应enum2text,选择项也从中取
                body = enumPanel(ConfigParam, InitValue, onValueChange, operating);
                break
            case UniConfigType.Int:
            case UniConfigType.Float:
                body = <InputNumber
                    defaultValue={InitValue}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case UniConfigType.SliceBool:
            case UniConfigType.SliceInt:
            case UniConfigType.SliceFloat:
            case UniConfigType.SliceString:
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
                case ConfigType.Plat:
                    sendCfgPlatSet(ConfigParam.key, newValue, callback)
                    break
                case ConfigType.Server:
                    sendCfgServiceSet(server, ConfigParam.key, newValue, callback)
                    break
                case ConfigType.User:
                    sendCfgServiceUserSet(server, user, ConfigParam.key, newValue, callback)
                    break
            }
        }}
        loading={operating}
        disabled={!needSave}
        icon={<SaveOutlined/>}
    >
    </Button>
    return <Space>
        {contextHolder}
        {head}
        {body}
        {foot}
    </Space>
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
    if (ConfigParam.uniConfigType === UniConfigType.Button) {
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
            case UniConfigType.SliceBool:
                editor = <Switch
                    checked={value[i]}
                    onChange={(newValue) => {
                        value[i] = newValue;
                        onValueChange(value);
                    }}
                    disabled={operating}
                />
                break
            case UniConfigType.SliceInt:
            case UniConfigType.SliceFloat:
                editor = <InputNumber
                    value={value[i]}
                    onChange={(newValue) => {
                        value[i] = newValue;
                        onValueChange(value);
                    }}
                    disabled={operating}
                />
                break
            case UniConfigType.SliceString:
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
        case UniConfigType.SliceBool:
            defaultNew = false;
            break
        case UniConfigType.SliceInt:
        case UniConfigType.SliceFloat:
            defaultNew = 0;
            break
        case UniConfigType.SliceString:
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

export class Configs {
    constructor(onDataChanged, cfgMode, server, user) {
        this.params = [];
        this.onDataChanged = onDataChanged;
        this.cfgMode = cfgMode;
        this.server = server;
        this.user = user;
    }

    cfgMode = ConfigType.Plat
    params = []
    data = {}
    onDataChanged = null
    server = ''
    user = ''

    addBase(key, text, uniConfigType, tips) {
        let param = new ConfigParam();
        param.key = key;
        param.text = text;
        param.uniConfigType = uniConfigType
        param.tips = tips;
        this.params.push(param);
    }

    get(key) {
        // 判断params中是否有key
        let param;
        for (let i = 0; i < this.params.length; i++) {
            if (this.params[i].key === key) {
                param = this.params[i];
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
            case ConfigType.Plat:
                realKey = 'PLAT.' + key;
                break
            case ConfigType.Server:
                realKey = this.server + '.' + key;
                break
            case ConfigType.User:
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
        if (this.onDataChanged) {
            this.onDataChanged(realKey, value);
        }
    }
}

// UniConfig 一个通用的配置界面，用于显示和修改配置。建议不要和ctx一起耦合，单独处理全局的已有配置
export function UniConfig({configs, server, user}) {
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
                configs.setByDB(key, ret.data[key].Data);
            }
            configs.onDataChanged()
        }
        if (configs.cfgMode === ConfigType.Plat) {
            sendCfgPlatGet(callback)
        } else if (configs.cfgMode === ConfigType.Server) {
            sendCfgServiceGet(server, callback)
        } else if (configs.cfgMode === ConfigType.User) {
            sendCfgServiceUserGet(server, user, callback)
        }
    }, [configs.cfgMode, configs, server, user]);

    // 配置面板
    let panels = [];
    for (let i = 0; i < configs.params.length; i++) {
        let data = null;
        if (configData !== null) {
            let realKey;
            switch (configs.cfgMode) {
                case ConfigType.Plat:
                    realKey = 'PLAT.' + configs.params[i].key;
                    break
                case ConfigType.Server:
                    realKey = server + '.' + configs.params[i].key;
                    break
                case ConfigType.User:
                    realKey = server + '.' + user + '.' + configs.params[i].key;
                    break
            }
            data = configData[realKey].Data;
        }
        panels.push(<ConfigPanel
            configs={configs}
            key={i}
            ConfigParam={configs.params[i]}
            cfgMode={configs.cfgMode}
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
