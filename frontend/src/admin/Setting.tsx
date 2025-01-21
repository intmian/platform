import {ConfigsCtr, UniConfig} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";

const AutoConfigs = new ConfigsCtr(ConfigsType.Server, 'auto')
AutoConfigs.addBaseConfig('news.keys', '新闻关键词', ConfigType.SliceString, '不用的后面标注#已废弃')
AutoConfigs.init()

function Setting() {
    return <div>
        <UniConfig configCtr={AutoConfigs}/>
    </div>
}

export default Setting;