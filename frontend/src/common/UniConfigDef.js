import {ValueType} from "./def.js";

export const UniConfigType = {
    ...ValueType,
    // 以上是基础类型，以下是扩展类型，实际存储的依然是基础类型
    textEnum: 1001,  // 用于选择枚举，不然让输入1、2、3、4、5也太抽象了

    // 以下是特殊的功能面板
    button: 2001,  // 用于执行某些操作
}
