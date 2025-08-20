import {ConfigsCtr, UniConfig} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";
import {TodoneSetting} from "../todone/Main";

const AutoConfigs = new ConfigsCtr(ConfigsType.Server, 'auto')
AutoConfigs.addBaseConfig('news.keys', '新闻关键词', ConfigType.SliceString, '不用的后面标注#已废弃')
// 不能提前初始化，不然会出现第一次打开界面没有登陆，重新登陆不会刷新的问题。
const MiscConfigs = new ConfigsCtr(ConfigsType.Plat)
MiscConfigs.addBaseConfig('r2.endpoint', 'R2 Endpoint', ConfigType.String, 'https://example.com')
MiscConfigs.addBaseConfig('r2.accessKey', 'R2 Access Key', ConfigType.String, 'example')
MiscConfigs.addBaseConfig('r2.secretKey', 'R2 Secret Key', ConfigType.String, 'example')
MiscConfigs.addBaseConfig('r2.bucket', 'R2 Bucket', ConfigType.String, 'example')
MiscConfigs.addBaseConfig('r2.web', 'R2 外部展示网址', ConfigType.String, 'https://example.com')

function Setting() {
    return <div>
        <UniConfig configCtr={AutoConfigs}/>
        <TodoneSetting/>
        <UniConfig configCtr={MiscConfigs}/>
    </div>
}

export default Setting;