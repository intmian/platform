import {Button, Space} from "antd";
import {sendSetStorage} from "./sendhttp.js";

class UniConfigParamCfg {
    key = '';  // 对应storage里面的key
    text = '';
    defaultValue = null;
    uniConfigType = 0;
    tips = '';
    enum2text = {}  // 如果是enum类型，这里是enum的值和对应的提示
}

class UniConfigParam {
    cfg = new UniConfigParamCfg();
    value = null;
}

class UniConfigData {
    params = []

    addBase(key, text, defaultValue, uniConfigType, tips) {
        let param = new UniConfigParam();
        param.cfg.key = key;
        param.cfg.text = text;
        param.cfg.defaultValue = defaultValue;
        param.cfg.uniConfigType = uniConfigType;
        param.cfg.tips = tips;
        this.params.push(param);
    }
}

function ParamNull(param, onValueChange) {
    return <Space>
        <div>{param.cfg.text}</div>
        <Button
            onClick={() => {
                param.value = param.cfg.defaultValue;
                sendSetStorage()
            }}
        >{"未激活，点击激活"}
        </Button>
    </Space>
}


// UniConfig 一个通用的配置界面，用于显示和修改配置
export function UniConfig({data}) {

}