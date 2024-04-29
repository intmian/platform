import {ValueType} from "./def.js";

export const UniConfigType = {
    ...ValueType,
    // 以上是基础类型，以下是扩展类型，实际存储的依然是基础类型
    Enum: 1001,  // 底层对应int，用于选择枚举，不然让输入1、2、3、4、5也太麻烦了
    property: 1002,  // 底层对应int，用于选择多个位属性，

    // 以下是特殊的功能面板
    Button: 2001,  // 用于执行某些操作，传入一个函数（建议是某个网络操作）
}

export class ConfigType {
    static Plat = 0;
    static Server = 1;
    static User = 2;
}