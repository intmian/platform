import {
    Button,
    Collapse,
    Flex,
    Input,
    InputNumber,
    List,
    Modal,
    notification,
    Row,
    Select,
    Space,
    Spin,
    Switch,
    Tooltip,
    Typography
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

const {Text} = Typography;

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

function ShowControlSavePanel({configs, InitValue, ConfigParam, InitLoading, cfgMode, tileLength}) {
    // 是否正在进行网络操作，内部加载中
    const [operating, setOperating] = useState(false);
    // 当前的值
    const [value, setValue] = useState(InitValue);
    // 是否需要保存
    const [needSave, setNeedSave] = useState(false);

    // 头部
    let head = <Text>{ConfigParam.text}:</Text>;
    if (ConfigParam.tips !== '') {
        head = <Tooltip title={ConfigParam.tips}>
            {head}
        </Tooltip>
    }


    // 数据操作区，处理value，并提示保存
    const onValueChange = (newValue) => {
        setNeedSave(true);
        setValue(newValue);
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
                    onChange={(ret) => {
                        onValueChange(ret.target.value)
                    }}
                    disabled={operating}
                />
                break
            case ConfigType.String:
                body = <Input
                    defaultValue={InitValue}
                    onChange={(ret) => {
                        onValueChange(ret.target.value)
                    }}
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
                    onChange={(ret) => {
                        onValueChange(ret.target.value)
                    }}
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
            let newValue;
            newValue = JSON.stringify(value);
            const realKey = ConfigParam.key;
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
                    sendCfgPlatSet(realKey, newValue, callback)
                    break
                case ConfigsType.Server:
                    sendCfgServiceSet(configs.server, realKey, newValue, callback)
                    break
                case ConfigsType.User:
                    sendCfgServiceUserSet(configs.server, configs.user, realKey, newValue, callback)
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
        <div style={{
            width: tileLength + 0.5 + 'em', display: 'flex', alignItems: 'center', height: '32px'
        }}>{head}</div>
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
export function ConfigPanel({configs, ConfigParam, InitLoading, InitValue, cfgMode, tileLength}) {
    // 特殊处理的一些类型
    if (ConfigParam.uniConfigType === ConfigType.Button) {
        return ButtonPanel(ConfigParam);
    }
    // 通用的展示、控制、保存组件
    return <ShowControlSavePanel
        tileLength={tileLength}
        configs={configs}
        InitValue={InitValue}
        ConfigParam={ConfigParam}
        InitLoading={InitLoading}
        cfgMode={cfgMode}
    />
}

function MultiInput({defaultValue, onValueChange, operating, type}) {
    if (defaultValue == null) {
        defaultValue = [];
    }
    const [RealValue, setRealValue] = useState(defaultValue);

    const InputStyle = {
        flex: 1,
    }

    let coms = [];
    for (let i = 0; i < RealValue.length; i++) {
        let editor = null;
        switch (type) {
            case ConfigType.SliceBool:
                editor = <Switch
                    style={InputStyle}
                    checked={RealValue[i]}
                    onChange={(newValue) => {
                        const newRealValue = [...RealValue];
                        newRealValue[i] = newValue;
                        setRealValue(newRealValue);
                        onValueChange(newRealValue);
                    }}
                    disabled={operating}
                />
                break;
            case ConfigType.SliceInt:
            case ConfigType.SliceFloat:
                editor = <InputNumber
                    style={InputStyle}
                    value={RealValue[i]} // 使用 value 而不是 defaultValue
                    onChange={(newValue) => {
                        const newRealValue = [...RealValue];
                        newRealValue[i] = newValue;
                        setRealValue(newRealValue);
                        onValueChange(newRealValue);
                    }}
                    disabled={operating}
                />
                break;
            case ConfigType.SliceString:
                editor = <Input
                    style={InputStyle}
                    value={RealValue[i]} // 使用 value 而不是 defaultValue
                    onChange={(newValue) => {
                        const newRealValue = [...RealValue];
                        newRealValue[i] = newValue.target.value;
                        setRealValue(newRealValue);
                        onValueChange(newRealValue);
                    }}
                    disabled={operating}
                />
                break;
        }

        coms.push(<Row style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
        }} key={i}> {/* 使用 i 作为 key，保证稳定 */}
            <Flex gap={"small"} style={{width: "100%"}}>
                {editor}
                <Button onClick={() => {
                    const newRealValue = [...RealValue];
                    newRealValue.splice(i, 1);
                    setRealValue(newRealValue);
                    onValueChange(newRealValue);
                }}
                        type={"text"}
                        icon={<CloseOutlined style={{color: 'red'}}/>}
                />
            </Flex>
        </Row>);
    }

    let defaultNew = null;
    switch (type) {
        case ConfigType.SliceBool:
            defaultNew = false;
            break;
        case ConfigType.SliceInt:
        case ConfigType.SliceFloat:
            defaultNew = 0;
            break;
        case ConfigType.SliceString:
            defaultNew = '';
            break;
    }

    let adder = <Button
        onClick={() => {
            const newValue = [...RealValue, defaultNew];
            setRealValue(newValue);
            onValueChange(newValue);
        }}
        type={"dashed"}
        style={{width: '100%'}}
    >
        添加新值
    </Button>;
    return <Collapse
        bordered={false}
        size={"small"}
        style={{width: '100%'}}
        items={[{
            key: '1', label: '点击修改', children: <Space direction={"vertical"} style={{width: '100%'}}>
                {coms}
                {adder}
            </Space>
        }]}
    />

}

export class ConfigsCtr {
    cfgMode = ConfigsType.Plat
    configs = []
    data = {}
    onDataChanged = []
    server = ''
    user = ''
    inInit = true

    constructor(cfgMode, server, user) {
        this.configs = [];
        this.cfgMode = cfgMode;
        this.server = server;
        this.user = user;
    }

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

    callBack(isInit) {
        for (let i = 0; i < this.onDataChanged.length; i++) {
            this.onDataChanged[i](isInit);
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
        this.callBack(false)
    }

    init() {
        let callback = (ret) => {
            // 后端传的key都是真实key不需要二次处理，所以调用特殊函数，同时为了避免重复渲染，最后触发一次回调。
            for (let key in ret.data) {
                this.setByDB(key, ret.data[key].Data);
            }
            this.inInit = false;
            this.callBack(true)
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
export function UniConfig({configCtr}) {
    // 加载中
    const [loading, setLoading] = useState(true);

    // 初始化
    useEffect(() => {
        // 初始化过了就用ctr的数据初始化，否则请求数据
        if (!configCtr.inInit) {
            setLoading(false);
            return;
        }
        let callback = (ret) => {
            setLoading(false);
            // 后端传的key都是真实key不需要二次处理，所以调用特殊函数，同时为了避免重复渲染，最后触发一次回调。
            for (let key in ret.data) {
                configCtr.setByDB(key, ret.data[key].Data);
            }
            configCtr.callBack(true)
        }
        if (configCtr.cfgMode === ConfigsType.Plat) {
            sendCfgPlatGet(callback)
        } else if (configCtr.cfgMode === ConfigsType.Server) {
            sendCfgServiceGet(configCtr.server, callback)
        } else if (configCtr.cfgMode === ConfigsType.User) {
            sendCfgServiceUserGet(configCtr.server, configCtr.user, callback)
        }
    }, [configCtr.cfgMode, configCtr, configCtr.server, configCtr.user]);

    // 配置面板
    let panels = [];
    let maxTitleLength = 0;

    for (let i = 0; i < configCtr.configs.length; i++) {
        // 英文字符按照0.5计算
        let titleLength = configCtr.configs[i].text.length * 0.5;
        for (let j = 0; j < configCtr.configs[i].text.length; j++) {
            if (configCtr.configs[i].text.charCodeAt(j) > 255) {
                titleLength += 0.5;
            }
        }
        if (titleLength > maxTitleLength) {
            maxTitleLength = titleLength
        }
    }

    for (let i = 0; i < configCtr.configs.length; i++) {
        let data = null;
        if (configCtr.data !== null) {
            let realKey;
            switch (configCtr.cfgMode) {
                case ConfigsType.Plat:
                    realKey = 'PLAT.' + configCtr.configs[i].key;
                    break
                case ConfigsType.Server:
                    realKey = configCtr.server + '.' + configCtr.configs[i].key;
                    break
                case ConfigsType.User:
                    realKey = configCtr.server + '.' + configCtr.user + '.' + configCtr.configs[i].key;
                    break
            }
            if (configCtr.data[realKey] !== undefined) {
                data = configCtr.data[realKey];
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
            tileLength={maxTitleLength}
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

export function UniConfigModal({name, ctr, onExit, show}) {
    return <Modal
        title={name}
        open={show}
        footer={null}
        maskClosable={true}
        onCancel={() => {
            onExit()
        }}
    >
        <UniConfig
            configCtr={ctr}
        />
    </Modal>
}