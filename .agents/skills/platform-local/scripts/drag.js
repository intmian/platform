// 在浏览器里模拟 dnd-kit 拖动（用 MouseSensor 的页面适用）。粘贴到页面的 JS 执行环境里调用：
//   await dragTo(handleEl, () => targetEl, 0.25)
// frac 是落点在目标行高度里的位置（0 顶部，1 底部）。函数返回松手前页面上的落点提示类名，
// 便于确认插入线或高亮是否正确。拖动途中截图会让拖动被取消，需要检查的东西都在函数里读出来。
async function dragTo(handle, getTarget, frac = 0.5, steps = 14) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ev = (type, el, x, y) => el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1,
    }));
    const b = handle.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    ev('mousedown', handle, x, y);
    const targetY = () => {
        const t = getTarget().getBoundingClientRect();
        return t.top + t.height * frac;
    };
    for (let i = 1; i <= steps; i++) {
        await wait(40);
        ev('mousemove', document, x + 10, y + (targetY() - y) * i / steps);
    }
    await wait(300);
    const ty = targetY();
    ev('mousemove', document, x + 10, ty);
    await wait(300);
    const hints = [...document.querySelectorAll('[class*="drop"]')].map((e) => e.className).filter((c) => typeof c === 'string');
    ev('mouseup', document, x + 10, ty);
    await wait(1500);
    return hints;
}
