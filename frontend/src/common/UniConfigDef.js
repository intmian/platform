import {ValueType} from "./def.js";

export const ConfigType = {
    ...ValueType,
    // 以上是基础类型，以下是扩展类型，实际存储的依然是基础类型
    Enum: 1001,  // 底层仍然走基础类型（通常是 string/int），前端只负责下拉展示
    property: 1002,  // 底层对应int，用于选择多个位属性，

    // 以下是特殊的功能面板
    Button: 2001,  // 用于执行某些操作，传入一个函数（建议是某个网络操作）
}

export class ConfigsType {
    static Plat = 0;
    static Server = 1;
    static User = 2;
}
