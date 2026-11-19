import {Modal} from "antd";

// 记录设置页各分类有没有未保存的修改，供后台菜单切换时判断
const dirtySections = new Set<string>();

export function setSettingsDirty(section: string, dirty: boolean) {
    if (dirty) {
        dirtySections.add(section);
    } else {
        dirtySections.delete(section);
    }
}

export function hasUnsavedSettings(): boolean {
    return dirtySections.size > 0;
}

export function clearSettingsDirty() {
    dirtySections.clear();
}

export function confirmLeaveSettings(onLeave: () => void, onStay?: () => void) {
    if (!hasUnsavedSettings()) {
        onLeave();
        return;
    }
    Modal.confirm({
        title: "有未保存的修改",
        content: "离开后这些修改会丢失。",
        okText: "放弃并离开",
        okButtonProps: {danger: true},
        cancelText: "继续编辑",
        onOk: () => {
            clearSettingsDirty();
            onLeave();
        },
        onCancel: onStay,
    });
}
