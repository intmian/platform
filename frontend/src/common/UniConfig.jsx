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

function ButtonPanel(ConfigParam) {
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

function ShowControlSavePanel({InitValue, ConfigParam, InitLoading, cfgMode, server, user}) {
    // 是否正在进行网络操作，内部加载中
    const [operating, setOperating] = useState(false);
    // 当前的值
    const [value, setValue] = useState(InitValue);
    // 是否需要保存
    const [needSave, setNeedSave] = useState(false);

    // 头部
    const head = <Tooltip title={ConfigParam.tips}>
        <div>{ConfigParam.text}:</div>
    </Tooltip>

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
            const callback = (ret) => {
                if (ret.ok) {
                    openNotificationWithIcon('success', '保存成功', '保存成功');
                    setOperating(false);
                    setNeedSave(false);
                } else {
                    openNotificationWithIcon('error', '保存失败', '保存失败');
                    setOperating(false);
                    setNeedSave(true);
                }
            }
            switch (cfgMode) {
                case ConfigType.Plat:
                    sendCfgPlatSet(ConfigParam.key, value, callback)
                    break
                case ConfigType.Server:
                    sendCfgServiceSet(server, ConfigParam.key, value, callback)
                    break
                case ConfigType.User:
                    sendCfgServiceUserSet(server, user, ConfigParam.key, value, callback)
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
export function ConfigPanel({ConfigParam, InitLoading, InitValue, cfgMode, server, user}) {
    // 特殊处理的一些类型
    if (ConfigParam.uniConfigType === UniConfigType.Button) {
        return ButtonPanel(ConfigParam);
    }
    // 通用的展示、控制、保存组件
    return <ShowControlSavePanel
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
    params = []

    addBase(key, text, defaultValue, uniConfigType, tips) {
        let param = new ConfigParam();
        param.key = key;
        param.text = text;
        param.defaultValue = defaultValue;
        param.uniConfigType = uniConfigType
        param.tips = tips;
        this.params.push(param);
    }
}

// UniConfig 一个通用的配置界面，用于显示和修改配置。建议不要和ctx一起耦合，单独处理全局的已有配置
export function UniConfig({configs, cfgMode, server, user}) {
    // 加载中
    const [loading, setLoading] = useState(true);
    // 配置
    const [configData, setConfigs] = useState(null);

    // 初始化
    useEffect(() => {
        let callback = (ret) => {
            setConfigs(ret.data);
            setLoading(false);
        }
        if (cfgMode === ConfigType.Plat) {
            sendCfgPlatGet(callback)
        } else if (cfgMode === ConfigType.Server) {
            sendCfgServiceGet(server, callback)
        } else if (cfgMode === ConfigType.User) {
            sendCfgServiceUserGet(server, user, callback)
        }
    }, [cfgMode, server, user]);

    // 配置面板
    let panels = [];
    for (let i = 0; i < configs.params.length; i++) {
        let data = null;
        if (configData !== null) {
            let realKey;
            switch (cfgMode) {
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
            key={i}
            ConfigParam={configs.params[i]}
            cfgMode={cfgMode}
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
