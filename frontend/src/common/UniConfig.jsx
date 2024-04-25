import {Badge, Button, Input, InputNumber, Space, Spin, Switch, Tooltip} from "antd";
import {useState} from "react";
import {UniConfigType} from "./UniConfigDef.js";
import {CloseOutlined} from "@ant-design/icons";

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

/*
* ConfigPanel 单项配置的面板
* ConfigParam 配置的参数
* InitLoading 是否正在初始化
* InitValue 初始化的值
* 如果正在加载中，会显示加载中的状态，否在会在底层未改变初始值的情况下显示值。
* */
function ConfigPanel({ConfigMeta, InitLoading, InitValue}) {
    // 是否正在进行网络操作，内部加载中
    const [operating, setOperating] = useState(false);
    // 当前的值
    const [value, setValue] = useState(InitValue);
    // 是否需要保存
    const [needSave, setNeedSave] = useState(false);

    // 头部
    const head = <Tooltip title={ConfigMeta.tips}>
        <div>{ConfigMeta.text}</div>
    </Tooltip>

    // 数据操作区，处理value，并提示保存
    const onValueChange = (newValue) => {
        setNeedSave(true);
        setValue(newValue);
    }
    let body = null;
    if (!InitLoading) {
        body = <Spin/>
    } else {
        // 根据类型显示不同的内容
        switch (ConfigMeta.uniConfigType) {
            case UniConfigType.Bool:
                body = <Switch
                    checked={value}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case UniConfigType.String:
                body = <Input
                    value={value}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case UniConfigType.Int:
            case UniConfigType.Float:
                body = <InputNumber
                    value={value}
                    onChange={onValueChange}
                    disabled={operating}
                />
                break
            case UniConfigType.SliceBool:
            case UniConfigType.SliceInt:
            case UniConfigType.SliceFloat:
            case UniConfigType.SliceString:
                body = <MultiInput
                    value={value}
                    onValueChange={onValueChange}
                    operating={operating}
                    type={ConfigMeta.uniConfigType}
                />
                break

        }
    }

    // 保存区
    let foot = <Button
        onClick={() => {
            setOperating(true);
            // TODO: 根据类型进行保存
            setOperating(false);
            setNeedSave(false);
        }}
        disabled={!needSave}
    />
    return <Space>
        {head}
        {body}
        {foot}
    </Space>
}

function MultiInput({value, onValueChange, operating, type}) {
    // 一组Switch，每个Switch右上角有一个删除按钮，点击删除按钮会删除这个Switch，后面有一个按钮可以添加新的Switch
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
        coms.push(<Badge
            count={
                < CloseOutlined
                    style={{fontSize: '20px'}}
                    onClick={() => console.log('删除')}
                />}
            key={i}
        >
            {editor}
        </Badge>)
    }
    return <Space>
        {coms}
        <Button
            onClick={() => {
                value.push(false);
                // 默认添加零值，这里不需要默认值
                onValueChange(value);
            }}
        >添加</Button>
    </Space>
}

class Configs {
    configs = []

    addBase(key, text, defaultValue, uniConfigType, tips) {
        let param = new Config();
        param.meta.key = key;
        param.meta.text = text;
        param.meta.defaultValue = defaultValue;
        param.meta.uniConfigType = uniConfigType;
        param.meta.tips = tips;
        this.configs.push(param);
    }
}

// UniConfig 一个通用的配置界面，用于显示和修改配置
export function UniConfig({data}) {

}
