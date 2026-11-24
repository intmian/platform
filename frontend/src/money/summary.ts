import {getMoneyRecord, listMoneyRecords, listMoneyItems} from "./moneyApi";
import {MoneyDashboard, MoneyDashboardTrendItem, MoneyItem, MoneySummary, ReconciliationRecord, ReconciliationEntry} from "./types";

export function signedEntryValue(entry: ReconciliationEntry, item: MoneyItem | undefined, value: number) {
    if (item?.includeInLiability || entry.includeInLiabilitySnapshot) {
        return -Math.abs(value || 0);
    }
    return value || 0;
}

function roundMoneyRate(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round(value * 10000) / 10000;
}

export function entryPrincipalChangeCents(entry: ReconciliationEntry) {
    return entry.investmentPrincipalChangeCents || 0;
}

export function entryInvestmentProfitCents(entry: ReconciliationEntry, item: MoneyItem | undefined) {
    const currentValue = signedEntryValue(entry, item, entry.currentValueCents);
    const previousValue = signedEntryValue(entry, item, entry.previousValueCents);
    return currentValue - previousValue - entryPrincipalChangeCents(entry);
}

export function entryTotalChangeCents(entry: ReconciliationEntry, item: MoneyItem | undefined) {
    const currentValue = signedEntryValue(entry, item, entry.currentValueCents);
    const previousValue = signedEntryValue(entry, item, entry.previousValueCents);
    return currentValue - previousValue;
}

export function computeReconcileSummary(entries: ReconciliationEntry[], itemById: Map<string, MoneyItem>, hasPreviousRecord: boolean): MoneySummary {
    const summary: MoneySummary = {
        cashCents: 0,
        netAssetCents: 0,
        liabilityCents: 0,
        totalAssetCents: 0,
        netAssetChangeCents: 0,
        investmentProfitCents: 0,
        netAssetLiabilityRate: 0,
        assetLiabilityRate: 0,
        positiveAssetCents: 0,
        calculationWarningMessages: [],
    };
    let previousPositiveAssetCents = 0;
    let previousLiabilityCents = 0;
    entries.forEach((entry) => {
        const item = itemById.get(entry.itemId);
        const includeInLiability = item?.includeInLiability || entry.includeInLiabilitySnapshot;
        const currentValue = signedEntryValue(entry, item, entry.currentValueCents);
        const previousValue = signedEntryValue(entry, item, entry.previousValueCents);
        if (item?.includeInCash) {
            summary.cashCents += currentValue;
        }
        if (includeInLiability) {
            summary.liabilityCents += Math.abs(currentValue);
            previousLiabilityCents += Math.abs(previousValue);
            return;
        }
        if (item?.includeInNetAsset) {
            summary.positiveAssetCents += currentValue;
            previousPositiveAssetCents += previousValue;
        }
        if (item?.includeInInvestmentProfit) {
            summary.investmentProfitCents += currentValue - previousValue - entryPrincipalChangeCents(entry);
            if (entryPrincipalChangeCents(entry) === 0 && currentValue === 0) {
                summary.calculationWarningMessages.push(`${entry.itemNameSnapshot} 当期值为 0，年化变化率按 0 处理`);
            }
        }
    });
    summary.totalAssetCents = summary.positiveAssetCents;
    summary.netAssetCents = summary.positiveAssetCents - summary.liabilityCents;
    if (hasPreviousRecord) {
        summary.netAssetChangeCents = summary.netAssetCents - (previousPositiveAssetCents - previousLiabilityCents);
    }
    if (summary.netAssetCents !== 0) {
        summary.netAssetLiabilityRate = roundMoneyRate(summary.liabilityCents / Math.abs(summary.netAssetCents));
    }
    if (summary.totalAssetCents !== 0) {
        summary.assetLiabilityRate = roundMoneyRate(summary.liabilityCents / summary.totalAssetCents);
    }
    return summary;
}

function moneyItemMap(items: MoneyItem[]) {
    return new Map(items.map((item) => [item.id, item]));
}

export function sortRecordsAsc(records: ReconciliationRecord[]) {
    return [...records].sort((a, b) => {
        if (a.date === b.date) {
            return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
        }
        return String(a.date || "").localeCompare(String(b.date || ""));
    });
}

export function summarizeRecord(record: ReconciliationRecord | null | undefined, items: MoneyItem[], hasPreviousRecord: boolean) {
    return computeReconcileSummary(record?.entries || [], moneyItemMap(items), hasPreviousRecord);
}

export function dashboardLatestSummary(dashboard: MoneyDashboard | undefined) {
    const records = sortRecordsAsc(dashboard?.records || []);
    const latest = records[records.length - 1];
    if (!latest) {
        return undefined;
    }
    return summarizeRecord(latest, dashboard?.items || [], records.length > 1);
}

export function dashboardTrendItems(dashboard: MoneyDashboard | null): MoneyDashboardTrendItem[] {
    const allRecords = sortRecordsAsc(dashboard?.records || []);
    const startIndex = Math.max(0, allRecords.length - 5);
    const records = allRecords.slice(startIndex);
    const items = dashboard?.items || [];
    return records.map((record, index) => {
        const summary = summarizeRecord(record, items, startIndex + index > 0);
        return {
            date: record.date,
            cashCents: summary.cashCents,
            netAssetCents: summary.netAssetCents,
            liabilityCents: summary.liabilityCents,
            totalAssetCents: summary.totalAssetCents,
            investmentProfitCents: summary.investmentProfitCents,
            assetLiabilityRate: summary.assetLiabilityRate,
        };
    });
}

export async function loadAdminBookSummary(bookId: string) {
    const [recordRet, itemRet] = await Promise.all([
        listMoneyRecords(bookId),
        listMoneyItems(bookId),
    ]);
    const confirmed = (recordRet.items || [])
        .filter((item) => item.status === "confirmed")
        .sort((a, b) => {
            if (a.date === b.date) {
                return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
            }
            return String(a.date || "").localeCompare(String(b.date || ""));
        });
    const latest = confirmed[confirmed.length - 1];
    if (!latest) {
        return undefined;
    }
    const detail = await getMoneyRecord(bookId, latest.id);
    return summarizeRecord(detail.record, itemRet.items || [], confirmed.length > 1);
}

export async function loadAdminDashboardFallback(bookId: string, dashboard: MoneyDashboard) {
    const records = dashboard.records || [];
    const items = dashboard.items || [];
    if (records.length && items.length) {
        return dashboard;
    }
    const [recordRet, itemRet] = await Promise.all([
        listMoneyRecords(bookId),
        listMoneyItems(bookId),
    ]);
    const confirmed = (recordRet.items || [])
        .filter((item) => item.status === "confirmed")
        .sort((a, b) => {
            if (a.date === b.date) {
                return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
            }
            return String(a.date || "").localeCompare(String(b.date || ""));
        });
    const detailRecords = await Promise.all(confirmed.map(async (item) => {
        try {
            const detail = await getMoneyRecord(bookId, item.id);
            return detail.record;
        } catch {
            return null;
        }
    }));
    return {
        ...dashboard,
        items: items.length ? items : (itemRet.items || []),
        records: records.length ? records : detailRecords.filter((record): record is ReconciliationRecord => Boolean(record)),
        latestRecordId: dashboard.latestRecordId || confirmed[confirmed.length - 1]?.id || "",
        latestDate: dashboard.latestDate || confirmed[confirmed.length - 1]?.date || "",
    };
}
