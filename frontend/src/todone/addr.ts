enum AddrUnitType {
    UnValid,
    Dir,
    Group,
    SubGroup,
    Task,
}

type AddrUnit = {
    Type: AddrUnitType
    ID: number
}

export class Addr {
    private units: AddrUnit[]
    public readonly userID: string

    constructor(userID: string) {
        this.userID = userID
        this.units = []
    }

    public bindAddr(addr: string) {
        this.units = addr.split('/').map(unit => {
            const [type, id] = unit.split('-')
            switch (type) {
                case 'dir':
                    return {Type: AddrUnitType.Dir, ID: parseInt(id)}
                case 'grp':
                    return {Type: AddrUnitType.Group, ID: parseInt(id)}
                case 'subgrp':
                    return {Type: AddrUnitType.SubGroup, ID: parseInt(id)}
                case 'task':
                    return {Type: AddrUnitType.Task, ID: parseInt(id)}
                default:
                    return {Type: AddrUnitType.UnValid, ID: 0}
            }
        })
    }

    public addDir(dirID: number) {
        this.units.push({Type: AddrUnitType.Dir, ID: dirID})
    }

    public addGroup(groupID: number) {
        this.units.push({Type: AddrUnitType.Group, ID: groupID})
    }

    public addSubGroup(subGroupID: number) {
        this.units.push({Type: AddrUnitType.SubGroup, ID: subGroupID})
    }

    public addTask(taskID: number) {
        this.units.push({Type: AddrUnitType.Task, ID: taskID})
    }

    public toString() {
        return this.units.map(unit => {
            switch (unit.Type) {
                case AddrUnitType.Dir:
                    return `dir-${unit.ID}`
                case AddrUnitType.Group:
                    return `grp-${unit.ID}`
                case AddrUnitType.SubGroup:
                    return `subgrp-${unit.ID}`
                case AddrUnitType.Task:
                    return `task-${unit.ID}`
            }
        }).join('/')
    }

    public getLength() {
        return this.units.length
    }

    public getUnit(index: number) {
        return this.units[index]
    }

    public getLastUnit() {
        return this.units[this.units.length - 1]
    }

    public copy() {
        return {...this}
    }
}