import {PTask} from "./net/protocal";

export type TaskTreeNode = {
    task: PTask
    children: TaskTreeNode[]
}

export function ExportTasks(nodes: TaskTreeNode[], smallFirst: boolean): PTask[] {
    const tasks: PTask[] = []
    for (const node of nodes) {
        tasks.push(node.task)
    }
    // 根据Index排序
    tasks.sort((a, b) => {
        if (smallFirst) {
            return a.Index - b.Index
        } else {
            return b.Index - a.Index
        }
    })

    return tasks
}

export default class TaskTree {
    roots: TaskTreeNode[]

    constructor() {
        this.roots = []
    }

    clear() {
        this.roots = []
    }

    copy() {
        const tree = new TaskTree()
        tree.roots = this.roots
        return tree
    }

    addTasks(tasks: PTask[]) {
        const needAdd: PTask[] = []
        for (const task of tasks) {
            needAdd.push(task)
        }
        while (needAdd.length > 0) {
            // 遍历所有代添加任务，如果为根节点或者父节点已经添加，则添加
            let found = false
            for (let i = 0; i < needAdd.length; i++) {
                const task = needAdd[i]
                if (task.ParentID === 0) {
                    this.addTask(task)
                    needAdd.splice(i, 1)
                    found = true
                    break
                }
                const parent = this.findTask(task.ParentID)
                if (parent) {
                    this.addSubTask(parent.task.ID, task)
                    needAdd.splice(i, 1)
                    found = true
                    break
                }
            }
            // 存在某些父节点不存在的节点
            if (!found) {
                console.error("存在某些父节点不存在的节点", needAdd)
                break
            }
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
    moveTask(taskID: number, parentID: number) {
        // 默认放到最后面，生成数据的时候会根据Index排序
        // trg == 0 表示放到根目录
        const task = this.findTask(taskID)
        if (!task) {
            return
        }

        // 从树中删除
        this.deleteTask(taskID)

        // 添加到目标
        if (parentID === 0) {
            this.roots.push(task)
        } else {
            const trg = this.findTask(parentID)
            if (trg) {
                trg.children.push(task)
            }
        }
    }

    deleteTask(taskID: number) {
        // 从树中删除
        if (this.isRoot(taskID)) {
            this.roots = this.roots.filter((root) => root.task.ID !== taskID)
        } else {
            const parent = this.findParent(taskID)
            if (parent) {
                parent.children = parent.children.filter((child) => child.task.ID !== taskID)
            }
        }
    }
}