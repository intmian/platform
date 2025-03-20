/* 默认卡片阴影（低层级）
适用于普通卡片，例如列表项、普通信息框：
* */
export const lowLeverShadow = {
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.2), 0px 1px 2px rgba(0, 0, 0, 0.14)',
    borderRadius: '8px',
}

/*
* 2. 悬浮状态阴影（高层级）
适用于悬浮卡片，如悬浮按钮、弹出菜单等：
* */
export const highLevelShadow = {
    boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.3), 0px 1px 3px rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
}