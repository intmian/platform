// 与后端 xstorage.ValueType 对应
export const ValueType = {
    String: 1,
    Int: 2,
    Float: 3,
    Bool: 4,
    SliceBegin: 100,
    SliceString: 101,
    SliceInt: 102,
    SliceFloat: 103,
    SliceBool: 104,
} as const;

export type ValueTypeId = typeof ValueType[keyof typeof ValueType];

export function IsSliceType(type: number): boolean {
    return type >= ValueType.SliceBegin;
}

// 把表单里的字符串（数组类型是字符串数组）转成对应类型的值
export function Str2Unit(str: string | string[], type: number): unknown {
    const list = Array.isArray(str) ? str : [str];
    const one = Array.isArray(str) ? str[0] ?? "" : str;
    switch (type) {
        case ValueType.String:
            return one;
        case ValueType.Int:
            return parseInt(one);
        case ValueType.Float:
            return parseFloat(one);
        case ValueType.Bool:
            return one === "true";
        case ValueType.SliceString:
            return list;
        case ValueType.SliceInt:
            return list.map((item) => parseInt(item));
        case ValueType.SliceFloat:
            return list.map((item) => parseFloat(item));
        case ValueType.SliceBool:
            return list.map((item) => item === "true");
        default:
            return null;
    }
}

export const ValueTypeStr: Record<number, string> = {
    1: "字符串",
    2: "整数",
    3: "浮点",
    4: "布尔",
    101: "字符串数组",
    102: "整数数组",
    103: "浮点数组",
    104: "布尔数组",
};

// 有新权限要加在这里，后端也要加上对应的权限
export const AllPermission = [
    "admin",
    "auto",
    "auto.report",
    "ai",
    "gpt",
    "todone",
    "file",
];
