import {Empty} from "antd";
import {formatMoney, itemTypeLabel} from "./moneyApi";
import {MoneyItem, MoneySummary, ReconciliationRecord} from "./types";

type MoneyStructureNode = {
    key: string
    name: string
    valueCents: number
    children?: MoneyStructureNode[]
};

function addStructureAccount(
    categoryMap: Map<string, { valueCents: number, accounts: Map<string, MoneyStructureNode> }>,
    category: string,
    accountKey: string,
    accountName: string,
    valueCents: number,
) {
    const categoryNode = categoryMap.get(category) || {valueCents: 0, accounts: new Map<string, MoneyStructureNode>()};
    const accountNode = categoryNode.accounts.get(accountKey) || {
        key: `account-${accountKey}`,
        name: accountName,
        valueCents: 0,
    };
    accountNode.valueCents += valueCents;
    categoryNode.valueCents += valueCents;
    categoryNode.accounts.set(accountKey, accountNode);
    categoryMap.set(category, categoryNode);
}

function categoryNodesFromMap(categoryMap: Map<string, { valueCents: number, accounts: Map<string, MoneyStructureNode> }>) {
    return Array.from(categoryMap.entries())
        .map(([category, value]) => ({
            key: `category-${category}`,
            name: category,
            valueCents: value.valueCents,
            children: Array.from(value.accounts.values())
                .filter((account) => account.valueCents !== 0)
                .sort((a, b) => Math.abs(b.valueCents) - Math.abs(a.valueCents)),
        }))
        .filter((category) => category.valueCents !== 0)
        .sort((a, b) => Math.abs(b.valueCents) - Math.abs(a.valueCents));
}

export function buildNetAssetTree(record: ReconciliationRecord | null, items: MoneyItem[], summary: MoneySummary): MoneyStructureNode {
    const assetMap = new Map<string, { valueCents: number, accounts: Map<string, MoneyStructureNode> }>();
    const liabilityMap = new Map<string, { valueCents: number, accounts: Map<string, MoneyStructureNode> }>();
    const itemMap = new Map(items.map((item) => [item.id, item]));
    (record?.entries || []).forEach((entry) => {
        const item = itemMap.get(entry.itemId);
        const includeInLiability = Boolean(item?.includeInLiability || entry.includeInLiabilitySnapshot);
        const includeInNetAsset = Boolean(item?.includeInNetAsset);
        const category = itemTypeLabel(item?.type || entry.itemTypeSnapshot || "未分类");
        const accountName = item?.name || entry.itemNameSnapshot || "未命名账户";
        const accountKey = item?.id || entry.itemId || accountName;
        if (includeInLiability) {
            const valueCents = -Math.abs(entry.currentValueCents || 0);
            if (valueCents !== 0) {
                addStructureAccount(liabilityMap, category, accountKey, accountName, valueCents);
            }
            return;
        }
        if (includeInNetAsset && entry.currentValueCents !== 0) {
            addStructureAccount(assetMap, category, accountKey, accountName, entry.currentValueCents);
        }
    });
    const assetChildren = categoryNodesFromMap(assetMap);
    const liabilityChildren = categoryNodesFromMap(liabilityMap);
    const children: MoneyStructureNode[] = [];
    if (assetChildren.length || summary.totalAssetCents !== 0) {
        children.push({
            key: "asset-total",
            name: "资产",
            valueCents: summary.totalAssetCents,
            children: assetChildren,
        });
    }
    if (liabilityChildren.length || summary.liabilityCents !== 0) {
        children.push({
            key: "liability-total",
            name: "负债",
            valueCents: -Math.abs(summary.liabilityCents),
            children: liabilityChildren,
        });
    }
    return {
        key: "root",
        name: "净资产",
        valueCents: summary.netAssetCents,
        children,
    };
}

export function buildStructureTree(params: {
    rootName: string
    mode: "asset" | "liability"
    record: ReconciliationRecord | null
    items: MoneyItem[]
}): MoneyStructureNode {
    const emptyRoot = {key: "root", name: params.rootName, valueCents: 0, children: []};
    if (!params.record?.entries?.length || !params.items.length) {
        return emptyRoot;
    }
    const itemMap = new Map(params.items.map((item) => [item.id, item]));
    const categoryMap = new Map<string, { valueCents: number, accounts: Map<string, MoneyStructureNode> }>();

    params.record.entries.forEach((entry) => {
        const item = itemMap.get(entry.itemId);
        const includeInLiability = Boolean(item?.includeInLiability || entry.includeInLiabilitySnapshot);
        const shouldInclude = params.mode === "liability" ? includeInLiability && entry.currentValueCents !== 0 : !includeInLiability && entry.currentValueCents > 0;
        if (!shouldInclude) {
            return;
        }
        const structureValueCents = includeInLiability ? Math.abs(entry.currentValueCents) : entry.currentValueCents;
        const category = itemTypeLabel(item?.type || entry.itemTypeSnapshot || "未分类");
        const accountName = item?.name || entry.itemNameSnapshot || "未命名账户";
        const accountKey = item?.id || entry.itemId || accountName;
        addStructureAccount(categoryMap, category, accountKey, accountName, structureValueCents);
    });

    const children = categoryNodesFromMap(categoryMap);

    if (!children.length) {
        return emptyRoot;
    }

    return {
        key: "root",
        name: params.rootName,
        valueCents: children.reduce((sum, item) => sum + item.valueCents, 0),
        children,
    };
}

function StructureNodeRow({node, level}: { node: MoneyStructureNode, level: number }) {
    return <>
        <div className={`money-structure-row ${level === 0 ? "is-root" : "is-child"}`}>
            <span style={{paddingLeft: level ? 18 * level : 0}}>{node.name}</span>
            <strong>{formatMoney(node.valueCents)}</strong>
        </div>
        {(node.children || []).map((child) => <StructureNodeRow key={child.key} node={child} level={level + 1}/>)}
    </>;
}

export function StructureTree({root}: { root: MoneyStructureNode }) {
    if (!root.children?.length) {
        return <Empty description="暂无结构数据"/>;
    }
    return <div className="money-structure-tree">
        <StructureNodeRow node={root} level={0}/>
    </div>;
}
