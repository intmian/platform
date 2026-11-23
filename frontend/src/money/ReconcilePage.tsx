import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Alert, Button, DatePicker, Empty, Popconfirm, Spin, Table, message} from "antd";
import type {ColumnsType} from "antd/es/table";
import dayjs from "dayjs";
import {CheckCircleOutlined, DeleteOutlined, SaveOutlined} from "@ant-design/icons";
import {confirmMoneyRecord, deleteMoneyRecord, formatMoney, formatRate, getMoneyRecord, itemTypeLabel, listMoneyRecords, listMoneyBooks, listMoneyItems, updateMoneyRecord} from "./moneyApi";
import {MoneyRecordIndexItem, MoneyBook, MoneyItem, MoneySummary, ReconciliationRecord, ReconciliationEntry} from "./types";
import {MoneyShell, PageHeader, StatusTag, MoneyMetric, EditableStringList} from "./components";
import {daysBetween, compactStrings} from "./utils";
import {signedEntryValue, entryPrincipalChangeCents, entryInvestmentProfitCents, entryTotalChangeCents, computeReconcileSummary} from "./summary";
import {entryAmountInput, displayAmountOrDash} from "./AmountInput";
import {buildNetAssetTree, StructureTree} from "./structure";

type BookkeepingSuggestion = {
    id: string
    type: string
    fromItemId: string
    fromItemName: string
    toItemId: string
    toItemName: string
    bookValueCents: number
    actualValueCents: number
    diffCents: number
};

function suggestionTypeLabel(type: string) {
    const labels: Record<string, string> = {
        transfer: "转账",
        balance_expense: "平账支出",
        balance_income: "平账收入",
        investment_gain: "投资盈利",
        investment_loss: "投资亏损",
        unknown_income: "平账收入",
        unknown_expense: "平账支出",
    };
    return labels[type] || type || "未知";
}

function BalanceOverview({
    summary,
    hasPreviousRecord = true,
    record,
    items,
}: {
    summary: MoneySummary
    hasPreviousRecord?: boolean
    record: ReconciliationRecord
    items: MoneyItem[]
}) {
    const tree = useMemo(() => buildNetAssetTree(record, items, summary), [items, record, summary]);
    return <div className="money-balance-overview">
        <div className="money-balance-cards">
            <MoneyMetric label="净资产" value={formatMoney(summary.netAssetCents)}/>
            <MoneyMetric label="净资产负债率" value={formatRate(summary.netAssetLiabilityRate)}/>
            <MoneyMetric label="资产负债率" value={formatRate(summary.assetLiabilityRate)}/>
            <MoneyMetric label="资产变化" value={hasPreviousRecord ? formatMoney(summary.netAssetChangeCents) : "--"}/>
            <MoneyMetric label="投资盈利" value={hasPreviousRecord ? formatMoney(summary.investmentProfitCents) : "--"}/>
        </div>
        <StructureTree root={tree}/>
    </div>;
}

export function MoneyReconcilePage() {
    const navigate = useNavigate();
    const {bookId = "", recordId = ""} = useParams();
    const [record, setRecord] = useState<ReconciliationRecord | null>(null);
    const [historyItems, setHistoryItems] = useState<MoneyRecordIndexItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const [editVersion, setEditVersion] = useState(0);
    const [eventItems, setEventItems] = useState<string[]>([]);
    const [reconcileBook, setReconcileBook] = useState<MoneyBook | null>(null);
    const [reconcileItems, setReconcileItems] = useState<MoneyItem[]>([]);
    const latestRecordRef = useRef<ReconciliationRecord | null>(null);
    const latestEventItemsRef = useRef<string[]>([]);
    const editVersionRef = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ret, historyRet, itemRet, bookRet] = await Promise.all([
                getMoneyRecord(bookId, recordId),
                listMoneyRecords(bookId),
                listMoneyItems(bookId),
                listMoneyBooks(),
            ]);
            setRecord(ret.record);
            setHistoryItems(historyRet.items || []);
            setReconcileItems(itemRet.items || []);
            setReconcileBook((bookRet.books || []).find((item) => item.id === bookId) || null);
            setEventItems((ret.record.events || []).map((event) => event.content));
            editVersionRef.current = 0;
            setEditVersion(0);
        } catch {
            message.error("记录加载失败");
        } finally {
            setLoading(false);
        }
    }, [recordId, bookId]);

    useEffect(() => {
        if (bookId && recordId) {
            load();
        }
    }, [recordId, bookId, load]);

    useEffect(() => {
        latestRecordRef.current = record;
    }, [record]);

    useEffect(() => {
        latestEventItemsRef.current = eventItems;
    }, [eventItems]);

    const isDraft = record?.status === "draft";
    const previousRecord = useMemo(() => {
        if (!record?.date) {
            return null;
        }
        const candidates = historyItems
            .filter((item) => item.status === "confirmed" && item.id !== record.id && item.date < record.date)
            .sort((a, b) => b.date.localeCompare(a.date));
        return candidates[0] || null;
    }, [historyItems, record?.date, record?.id]);
    const intervalDays = daysBetween(previousRecord?.date, record?.date);
    const hasPreviousRecord = Boolean(previousRecord && intervalDays);
    const itemById = useMemo(() => new Map(reconcileItems.map((item) => [item.id, item])), [reconcileItems]);
    const investmentItemIds = useMemo(() => new Set(reconcileItems.filter((item) => item.includeInInvestmentProfit).map((item) => item.id)), [reconcileItems]);
    const isInvestmentEntry = useCallback((entry: ReconciliationEntry) => investmentItemIds.has(entry.itemId), [investmentItemIds]);
    const localSummary = useMemo(() => computeReconcileSummary(record?.entries || [], itemById, hasPreviousRecord), [hasPreviousRecord, itemById, record?.entries]);
    const visibleBookkeepingSuggestions = useMemo<BookkeepingSuggestion[]>(() => {
        const suggestions: BookkeepingSuggestion[] = [];
        if (!record) {
            return suggestions;
        }
        const primaryAccountId = reconcileBook?.primaryBalanceAccountId || "";
        const primaryEntry = record.entries.find((entry) => entry.itemId === primaryAccountId);
        if (primaryEntry) {
            const primaryItem = itemById.get(primaryEntry.itemId);
            const primaryBookValue = signedEntryValue(primaryEntry, primaryItem, primaryEntry.bookValueCents);
            const primaryActualValue = signedEntryValue(primaryEntry, primaryItem, primaryEntry.actualValueCents);
            let sumDiff = 0;
            record.entries.forEach((entry) => {
                if (entry.itemId === primaryAccountId) {
                    return;
                }
                const item = itemById.get(entry.itemId);
                const includeInReconcile = item?.includeInReconcile ?? entry.includeInReconcileSnapshot;
                const principalChangeCents = hasPreviousRecord && investmentItemIds.has(entry.itemId) ? entryPrincipalChangeCents(entry) : 0;
                if (principalChangeCents !== 0) {
                    sumDiff += principalChangeCents;
                    suggestions.push({
                        id: `investment-principal-${entry.itemId}`,
                        type: "transfer",
                        fromItemId: principalChangeCents > 0 ? primaryEntry.itemId : entry.itemId,
                        fromItemName: principalChangeCents > 0 ? primaryEntry.itemNameSnapshot : entry.itemNameSnapshot,
                        toItemId: principalChangeCents > 0 ? entry.itemId : primaryEntry.itemId,
                        toItemName: principalChangeCents > 0 ? entry.itemNameSnapshot : primaryEntry.itemNameSnapshot,
                        bookValueCents: entry.previousValueCents,
                        actualValueCents: entry.currentValueCents,
                        diffCents: Math.abs(principalChangeCents),
                    });
                }
                if (!includeInReconcile) {
                    return;
                }
                const bookValue = signedEntryValue(entry, item, entry.bookValueCents);
                const actualValue = signedEntryValue(entry, item, entry.actualValueCents);
                const diff = actualValue - bookValue;
                if (diff === 0) {
                    return;
                }
                sumDiff += diff;
                suggestions.push({
                    id: `transfer-${entry.itemId}`,
                    type: "transfer",
                    fromItemId: diff > 0 ? primaryEntry.itemId : entry.itemId,
                    fromItemName: diff > 0 ? primaryEntry.itemNameSnapshot : entry.itemNameSnapshot,
                    toItemId: diff > 0 ? entry.itemId : primaryEntry.itemId,
                    toItemName: diff > 0 ? entry.itemNameSnapshot : primaryEntry.itemNameSnapshot,
                    bookValueCents: entry.bookValueCents,
                    actualValueCents: entry.actualValueCents,
                    diffCents: Math.abs(diff),
                });
            });
            const primaryTheoretical = primaryBookValue - sumDiff;
            const unknown = primaryActualValue - primaryTheoretical;
            if (unknown !== 0) {
                suggestions.push({
                    id: "balance-primary",
                    type: unknown > 0 ? "balance_income" : "balance_expense",
                    fromItemId: unknown > 0 ? "" : primaryEntry.itemId,
                    fromItemName: unknown > 0 ? "平账收入" : primaryEntry.itemNameSnapshot,
                    toItemId: unknown > 0 ? primaryEntry.itemId : "",
                    toItemName: unknown > 0 ? primaryEntry.itemNameSnapshot : "平账支出",
                    bookValueCents: primaryEntry.bookValueCents,
                    actualValueCents: primaryEntry.actualValueCents,
                    diffCents: Math.abs(unknown),
                });
            }
        }
        if (hasPreviousRecord) {
            record.entries.forEach((entry) => {
                if (!investmentItemIds.has(entry.itemId)) {
                    return;
                }
                const investmentProfitCents = entryInvestmentProfitCents(entry, itemById.get(entry.itemId));
                if (investmentProfitCents === 0) {
                    return;
                }
                suggestions.push({
                    id: `investment-${entry.itemId}`,
                    type: investmentProfitCents > 0 ? "investment_gain" : "investment_loss",
                    fromItemId: investmentProfitCents > 0 ? "" : entry.itemId,
                    fromItemName: investmentProfitCents > 0 ? "投资盈利" : entry.itemNameSnapshot,
                    toItemId: investmentProfitCents > 0 ? entry.itemId : "",
                    toItemName: investmentProfitCents > 0 ? entry.itemNameSnapshot : "投资亏损",
                    bookValueCents: entry.previousValueCents,
                    actualValueCents: entry.currentValueCents,
                    diffCents: Math.abs(investmentProfitCents),
                });
            });
        }
        return suggestions;
    }, [hasPreviousRecord, investmentItemIds, itemById, reconcileBook?.primaryBalanceAccountId, record]);

    const markChanged = () => {
        editVersionRef.current += 1;
        setEditVersion(editVersionRef.current);
    };

    const patchRecord = (patch: Partial<ReconciliationRecord>) => {
        setRecord((prev) => prev ? {...prev, ...patch} : prev);
        markChanged();
    };

    const patchEntry = (index: number, patch: Partial<ReconciliationEntry>) => {
        setRecord((prev) => prev ? {
            ...prev,
            entries: prev.entries.map((entry, idx) => idx === index ? {...entry, ...patch} : entry),
        } : prev);
        markChanged();
    };

    const patchEventItems = (next: string[]) => {
        setEventItems(next);
        markChanged();
    };

    const materializeEvents = useCallback((next: ReconciliationRecord, values = eventItems) => ({
        ...next,
        events: compactStrings(values).map((content, index) => ({
            id: next.events?.[index]?.id || "",
            date: next.date,
            content,
        })),
    }), [eventItems]);

    const persistCurrentRecord = async (silent = false) => {
        if (!record) {
            return record;
        }
        const targetVersion = editVersionRef.current;
        setSaving(true);
        try {
            const ret = await updateMoneyRecord(bookId, materializeEvents(record));
            if (editVersionRef.current === targetVersion) {
                setRecord(ret.record);
            }
            if (!silent) {
                message.success(record.status === "confirmed" ? "记录已保存" : "草稿已保存");
            }
            return ret.record;
        } catch {
            if (!silent) {
                message.error("保存失败");
            }
            return null;
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (!bookId || editVersion === 0) {
            return;
        }
        const timer = window.setTimeout(async () => {
            const current = latestRecordRef.current;
            if (!current) {
                return;
            }
            const targetVersion = editVersionRef.current;
            setAutoSaving(true);
            try {
                const ret = await updateMoneyRecord(bookId, materializeEvents(current, latestEventItemsRef.current));
                if (editVersionRef.current === targetVersion) {
                    setRecord(ret.record);
                }
            } catch {
                message.error("自动保存失败");
            } finally {
                if (editVersionRef.current === targetVersion) {
                    setAutoSaving(false);
                }
            }
        }, 700);
        return () => window.clearTimeout(timer);
    }, [bookId, editVersion, materializeEvents]);

    const confirm = async () => {
        const saved = await persistCurrentRecord(true);
        if (!saved) {
            return;
        }
        try {
            const ret = await confirmMoneyRecord(bookId, saved.id);
            setRecord(ret.record);
            message.success("记录已确认");
        } catch {
            message.error("确认失败");
        }
    };

    const removeDraft = async () => {
        if (!record || !isDraft) {
            return;
        }
        try {
            await deleteMoneyRecord(bookId, record.id);
            message.success("草稿已删除");
            navigate(`/money/${bookId}/history`);
        } catch {
            message.error("删除失败");
        }
    };

    const columns: ColumnsType<ReconciliationEntry> = [
        {title: "项目", dataIndex: "itemNameSnapshot", fixed: "left", width: 130},
        {title: "类型", dataIndex: "itemTypeSnapshot", width: 120, render: (value) => itemTypeLabel(value)},
        {
            title: "上期值",
            dataIndex: "previousValueCents",
            width: 130,
            render: (value) => hasPreviousRecord ? <div className="money-amount">{formatMoney(value)}</div> : <span className="money-muted">--</span>,
        },
        {
            title: "账面值",
            dataIndex: "bookValueCents",
            width: 140,
            render: (value, record, index) => {
                if (!record.includeInReconcileSnapshot) {
                    return <span className="money-muted">不参与平账</span>;
                }
                return entryAmountInput(value, (next) => patchEntry(index, {bookValueCents: next}), {liability: record.includeInLiabilitySnapshot});
            },
        },
        {
            title: "实际值",
            dataIndex: "actualValueCents",
            width: 140,
            render: (value, record, index) => {
                if (!record.includeInReconcileSnapshot) {
                    return entryAmountInput(record.currentValueCents, (next) => patchEntry(index, {currentValueCents: next}), {liability: record.includeInLiabilitySnapshot});
                }
                return entryAmountInput(value, (next) => patchEntry(index, {actualValueCents: next, currentValueCents: next}), {liability: record.includeInLiabilitySnapshot});
            },
        },
        {
            title: "变化",
            dataIndex: "changeCents",
            width: 120,
            render: (_, record) => hasPreviousRecord && isInvestmentEntry(record) ? <div className="money-amount">{formatMoney(entryTotalChangeCents(record, itemById.get(record.itemId)))}</div> : <span className="money-muted">--</span>,
        },
        {
            title: "本金变更",
            dataIndex: "investmentPrincipalChangeCents",
            width: 150,
            render: (value, record, index) => {
                if (!hasPreviousRecord || !isInvestmentEntry(record)) {
                    return <span className="money-muted">--</span>;
                }
                return entryAmountInput(value || 0, (next) => patchEntry(index, {investmentPrincipalChangeCents: next}));
            },
        },
        {
            title: "投资盈利",
            width: 120,
            render: (_, record) => hasPreviousRecord && isInvestmentEntry(record) ? <div className="money-amount">{formatMoney(entryInvestmentProfitCents(record, itemById.get(record.itemId)))}</div> : <span className="money-muted">--</span>,
        },
        {
            title: "年化",
            dataIndex: "annualizedRate",
            width: 100,
            render: (value, record) => hasPreviousRecord && isInvestmentEntry(record) && entryPrincipalChangeCents(record) === 0 ? formatRate(value) : <span className="money-muted">--</span>,
        },
    ];

    return <MoneyShell>
        <PageHeader
            title="对账记录"
            desc={record ? `${record.date} · ${record.status === "confirmed" ? "已确认" : "草稿"}${autoSaving ? " · 自动保存中" : ""}` : ""}
            extra={<>
                <Button onClick={() => navigate("/money")}>退出</Button>
                <Button onClick={() => navigate(`/money/${bookId}/history`)}>记录历史</Button>
                <Button icon={<SaveOutlined/>} loading={saving} onClick={() => persistCurrentRecord()}>保存</Button>
                {isDraft ? <Popconfirm title="删除后草稿不可恢复，继续吗？" okText="删除草稿" cancelText="取消" onConfirm={removeDraft}><Button danger icon={<DeleteOutlined/>}>删除草稿</Button></Popconfirm> : null}
                {isDraft ? <Popconfirm title="确认这条记录吗？" onConfirm={confirm}><Button type="primary" icon={<CheckCircleOutlined/>}>确认记录</Button></Popconfirm> : null}
            </>}
        />
        <Spin spinning={loading}>
            {!record ? <div className="money-section"><Empty description="记录不存在"/></div> : <>
                <div className="money-section money-record-meta">
                    <div className="money-record-meta-item">
                        <label>
                            <span className="money-muted">日期</span>
                            <DatePicker
                                disabled={false}
                                value={record.date ? dayjs(record.date) : undefined}
                                onChange={(value) => patchRecord({date: value?.format("YYYY-MM-DD") || record.date})}
                            />
                        </label>
                    </div>
                    <div className="money-record-meta-item">
                        <span className="money-muted">间隔天数</span>
                        <div className="money-record-meta-value">{hasPreviousRecord ? `${intervalDays} 天` : "--"}</div>
                    </div>
                    <div className="money-record-meta-item">
                        <span className="money-muted">状态</span>
                        <div className="money-record-meta-value"><StatusTag status={record.status}/></div>
                    </div>
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>录入明细</h2></div>
                    <Table className="money-reconcile-table" rowKey="itemId" columns={columns} dataSource={record.entries || []} pagination={false} scroll={{x: 1150}}/>
                    <div className="money-reconcile-cards">
                        {(record.entries || []).map((entry, index) => <div className="money-entry-card" key={entry.itemId}>
                            <div className="money-entry-head">
                                <strong>{entry.itemNameSnapshot}</strong>
                                <span>{itemTypeLabel(entry.itemTypeSnapshot)}</span>
                            </div>
                            <div className="money-entry-grid">
                                <span>上期值</span><strong>{displayAmountOrDash(hasPreviousRecord, entry.previousValueCents)}</strong>
                                {entry.includeInReconcileSnapshot ? <>
                                    <span>账面值</span>{entryAmountInput(entry.bookValueCents, (next) => patchEntry(index, {bookValueCents: next}), {liability: entry.includeInLiabilitySnapshot})}
                                    <span>实际值</span>{entryAmountInput(entry.actualValueCents, (next) => patchEntry(index, {actualValueCents: next, currentValueCents: next}), {liability: entry.includeInLiabilitySnapshot})}
                                </> : <>
                                    <span>账面值</span><strong className="money-muted">不参与平账</strong>
                                    <span>实际值</span>{entryAmountInput(entry.currentValueCents, (next) => patchEntry(index, {currentValueCents: next}), {liability: entry.includeInLiabilitySnapshot})}
                                </>}
                                <span>变化</span><strong>{displayAmountOrDash(hasPreviousRecord && isInvestmentEntry(entry), entryTotalChangeCents(entry, itemById.get(entry.itemId)))}</strong>
                                <span>本金变更</span>{hasPreviousRecord && isInvestmentEntry(entry) ? entryAmountInput(entryPrincipalChangeCents(entry), (next) => patchEntry(index, {investmentPrincipalChangeCents: next})) : <strong className="money-muted">--</strong>}
                                <span>投资盈利</span><strong>{displayAmountOrDash(hasPreviousRecord && isInvestmentEntry(entry), entryInvestmentProfitCents(entry, itemById.get(entry.itemId)))}</strong>
                                <span>年化</span><strong>{hasPreviousRecord && isInvestmentEntry(entry) && entryPrincipalChangeCents(entry) === 0 ? formatRate(entry.annualizedRate) : "--"}</strong>
                            </div>
                        </div>)}
                    </div>
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>记账建议</h2></div>
                    {visibleBookkeepingSuggestions.length ? <Table
                        rowKey="id"
                        dataSource={visibleBookkeepingSuggestions}
                        pagination={false}
                        columns={[
                            {title: "类型", dataIndex: "type", width: 130, render: (value) => suggestionTypeLabel(value)},
                            {title: "来源", dataIndex: "fromItemName", width: 140},
                            {title: "目标", dataIndex: "toItemName", width: 140},
                            {title: "金额", dataIndex: "diffCents", width: 130, render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                        ]}
                    /> : <Empty description="暂无建议，调整录入后会自动更新"/>}
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>资产负债和投资计算</h2></div>
                    <BalanceOverview
                        summary={localSummary}
                        hasPreviousRecord={hasPreviousRecord}
                        record={record}
                        items={reconcileItems}
                    />
                    {localSummary.calculationWarningMessages.length ? <Alert
                        style={{marginTop: 12}}
                        type="warning"
                        showIcon
                        message={localSummary.calculationWarningMessages.join("；")}
                    /> : null}
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>大事记</h2></div>
                    <EditableStringList disabled={false} values={eventItems} onChange={patchEventItems} placeholder="大事记内容"/>
                </div>
            </>}
        </Spin>
    </MoneyShell>;
}
