import "./locate.css";

/**
 * 从“关注”页跳到清单后，把页面滚到指定的任务（或它所在的那一栏）并闪一下。
 * 清单页的任务是异步加载的，所以这里隔一小会儿找一次，找到为止：
 * - 任务行带 data-todone-task，栏（子分组）带 data-todone-subgroup；
 * - 任务一直没出现（比如那一栏被收起了），就退而求其次定位到那一栏。
 */
export interface LocateTarget {
    taskID?: number
    subGroupID?: number
}

const STEP_MS = 150;
const FALLBACK_AFTER_MS = 2500; // 这么久还没找到任务，就改为定位到栏
const GIVE_UP_MS = 6000;

let timer = 0;

export function locateInPage(target: LocateTarget) {
    window.clearInterval(timer);
    if (!target.taskID && !target.subGroupID) return;
    const startAt = Date.now();
    const find = (attr: string, id?: number) =>
        id ? document.querySelector<HTMLElement>(`[${attr}="${id}"]`) : null;
    timer = window.setInterval(() => {
        const waited = Date.now() - startAt;
        let el = find('data-todone-task', target.taskID);
        if (!el && (!target.taskID || waited > FALLBACK_AFTER_MS)) el = find('data-todone-subgroup', target.subGroupID);
        if (el) {
            window.clearInterval(timer);
            flash(el);
        } else if (waited > GIVE_UP_MS) {
            window.clearInterval(timer);
        }
    }, STEP_MS);
}

function flash(el: HTMLElement) {
    el.scrollIntoView({block: 'center', behavior: 'smooth'});
    el.classList.remove('todone-locate-flash');
    void el.offsetWidth; // 强制重排，让同一个元素能重新播放动画
    el.classList.add('todone-locate-flash');
    window.setTimeout(() => el.classList.remove('todone-locate-flash'), 2600);
}
