import {PTask} from "./net/protocal";

type TaskTreeNode = {
    task: PTask
    children: TaskTreeNode[]
}

function ExportTasks(nodes: TaskTreeNode[]): PTask[] {
    const tasks: PTask[] = []
    for (const node of nodes) {
        tasks.push(node.task)
        tasks.push(...ExportTasks(node.children))
    }
    // 根据Index排序
    tasks.sort((a, b) => a.Index - b.Index)

    return tasks
}

export default class TaskTree {
    roots: TaskTreeNode[]

    constructor() {
        this.roots = []
    }

    addTasks(tasks: PTask[]) {
        for (const task of tasks) {
            const node: TaskTreeNode = {
                task: task,
                children: []
            }
            this.roots.push(node)
        }
    }

    addTask(task: PTask) {
        const node: TaskTreeNode = {
            task: task,
            children: []
        }
        this.roots.push(node)
    }

    isRoot(taskID: number): boolean {
        for (const root of this.roots) {
            if (root.task.ID === taskID) {
                return true
            }
        }
        return false
    }

    findParent(taskID: number): TaskTreeNode | null {
        // 递归寻找
        const find = (node: TaskTreeNode): TaskTreeNode | null => {
            for (const child of node.children) {
                if (child.task.ID === taskID) {
                    return node
                }
                const found = find(child)
                if (found) {
                    return found
                }
            }
            return null
        }
        for (const root of this.roots) {
            const found = find(root)
            if (found) {
                return found
            }
        }
        return null
    }

    findTask(id: number): TaskTreeNode | null {
        // 递归寻找
        const find = (node: TaskTreeNode): TaskTreeNode | null => {
            if (node.task.ID === id) {
                return node
            }
            for (const child of node.children) {
                const found = find(child)
                if (found) {
                    return found
                }
            }
            return null
        }
        for (const root of this.roots) {
            const found = find(root)
            if (found) {
                return found
            }
        }
        return null
    }

    addSubTask(parentID: number, task: PTask) {
        const parent = this.findTask(parentID)
        if (parent) {
            const node: TaskTreeNode = {
                task: task,
                children: []
            }
            parent.children.push(node)
        }
    }

    // 在树中移动，请注意必须在移动前修改task的Index与ParentID等数据
    moveTask(taskID: number, trgID: number) {
        // 默认放到最后面，生成数据的时候会根据Index排序
        // trg == 0 表示放到根目录
        const task = this.findTask(taskID)
        if (!task) {
            return
        }

        // 从树中删除
        if (this.isRoot(taskID)) {
            this.roots = this.roots.filter((root) => root.task.ID !== taskID)
        } else {
            const parent = this.findParent(taskID)
            if (parent) {
                parent.children = parent.children.filter((child) => child.task.ID !== taskID)
            }
        }

        // 添加到目标
        if (trgID === 0) {
            this.roots.push(task)
        } else {
            const trg = this.findTask(trgID)
            if (trg) {
                trg.children.push(task)
            }
        }
    }
}