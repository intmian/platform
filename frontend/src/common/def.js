/*
* const (
	ValueTypeNormalBegin ValueType = iota
	ValueTypeString
	ValueTypeInt
	ValueTypeFloat
	ValueTypeBool
	ValueTypeNormalEnd
	ValueTypeSliceBegin  = 100
	ValueTypeSliceString = iota + ValueTypeSliceBegin - ValueTypeNormalEnd - 1
	ValueTypeSliceInt
	ValueTypeSliceFloat
	ValueTypeSliceBool
)
* */

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
}

export function IsSliceType(type) {
    return type >= ValueType.SliceBegin;
}

export const TypeFromValueType = {
    1: ValueType.String,
    2: ValueType.Int,
    3: ValueType.Float,
    4: ValueType.Bool,
    101: ValueType.SliceString,
    102: ValueType.SliceInt,
    103: ValueType.SliceFloat,
    104: ValueType.SliceBool,
}

export const ValueTypeStr = {
    1: '字符串',
    2: '整数',
    3: '浮点',
    4: '布尔',
    101: '字符串数组',
    102: '整数数组',
    103: '浮点数组',
    104: '布尔数组',
}

export const AllPermission = [
    'admin',
]