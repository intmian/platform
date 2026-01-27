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

// 前端暂存的数据，用于存储任务，变动数据时用服务器返回最新副本更新此处。
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
        // 如果是根节点，添加到根节点
        if (task.ParentID === 0) {
            this.roots.push(node)
        } else {
            // 否则添加到父节点
            const parent = this.findTask(task.ParentID)
            if (parent) {
                parent.children.push(node)
            }
        }
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

    moveTaskTo(sourceId: number, targetId: number, position: 'over' | 'after' | 'before') {
        const sourceNode = this.findTask(sourceId);
        const targetNode = this.findTask(targetId);

        if (!sourceNode || !targetNode || sourceId === targetId) return;

        // 1. 从原位置移除
        this.deleteTask(sourceId);

        // 2. 插入新位置
        if (position === 'over') {
            // 作为子任务插入到 children 末尾
            targetNode.children.push(sourceNode);
            sourceNode.task.ParentID = targetNode.task.ID;
        } else {
            // 插入到 target 的同级
            // 找到 target 的父级数组
            let parentChildren: TaskTreeNode[] | null = null;
            let parentID = 0;

            if (this.isRoot(targetId)) {
                parentChildren = this.roots;
                parentID = 0;
            } else {
                const parent = this.findParent(targetId);
                if (parent) {
                    parentChildren = parent.children;
                    parentID = parent.task.ID;
                }
            }

            if (parentChildren) {
                const targetIndex = parentChildren.findIndex(n => n.task.ID === targetId);
                if (targetIndex !== -1) {
                    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
                    parentChildren.splice(insertIndex, 0, sourceNode);
                    sourceNode.task.ParentID = parentID;
                }
            }
        }
    }
}