import config from "../config.json";
import {UniPost} from "../common/newSendHttp";
import {
    MoneyBook,
    MoneyBatchIndexItem,
    MoneyDashboard,
    MoneyImportPreview,
    MoneyItem,
    ReconciliationBatch
} from "./types";

async function moneyPost<T>(path: string, req: object): Promise<T> {
    const ret = await UniPost(config.api_base_url + path, req);
    if (!ret.ok) {
        throw new Error("请求失败");
    }
    return ret.data as T;
}

export function listMoneyBooks() {
    return moneyPost<{ books: MoneyBook[] }>("/misc/money/book/list", {});
}

export function createMoneyBook(name: string) {
    return moneyPost<{ book: MoneyBook }>("/misc/money/book/create", {name});
}

export function updateMoneyBook(req: {
    id: string
    name: string
    primaryBalanceAccountId: string
    enabled: boolean
    viewerUsers: string[]
}) {
    return moneyPost<{ book: MoneyBook }>("/misc/money/book/update", req);
}

export function deleteMoneyBook(id: string) {
    return moneyPost<{ suc: boolean }>("/misc/money/book/delete", {id});
}

export function grantMoneyDashboard(bookId: string, viewerUsers: string[]) {
    return moneyPost<{ book: MoneyBook }>("/misc/money/book/grant-dashboard", {bookId, viewerUsers});
}

export function listMoneyItems(bookId: string) {
    return moneyPost<{ items: MoneyItem[] }>("/misc/money/item/list", {bookId});
}

export function updateMoneyItems(bookId: string, items: MoneyItem[]) {
    return moneyPost<{ items: MoneyItem[] }>("/misc/money/item/update", {bookId, items});
}

export function createMoneyBatch(req: {
    bookId: string
    date?: string
    intervalDays?: number
    copyFromBatchId?: string
}) {
    return moneyPost<{ batch: ReconciliationBatch }>("/misc/money/batch/create", req);
}

export function getMoneyBatch(bookId: string, batchId: string) {
    return moneyPost<{ batch: ReconciliationBatch }>("/misc/money/batch/get", {bookId, batchId});
}

export function updateMoneyBatch(bookId: string, batch: ReconciliationBatch) {
    return moneyPost<{ batch: ReconciliationBatch }>("/misc/money/batch/update", {bookId, batch});
}

export function computeMoneyBatch(bookId: string, batchId: string) {
    return moneyPost<{ batch: ReconciliationBatch }>("/misc/money/batch/compute", {bookId, batchId});
}

export function confirmMoneyBatch(bookId: string, batchId: string) {
    return moneyPost<{ batch: ReconciliationBatch }>("/misc/money/batch/confirm", {bookId, batchId});
}

export function listMoneyBatches(bookId: string) {
    return moneyPost<{ items: MoneyBatchIndexItem[] }>("/misc/money/batch/list", {bookId});
}

export function getMoneyDashboard(bookId: string) {
    return moneyPost<MoneyDashboard>("/misc/money/dashboard/get", {bookId});
}

export function previewMoneyExcelImport(bookId: string, fileName: string, fileBase64: string) {
    return moneyPost<{ preview: MoneyImportPreview }>("/misc/money/import/excel/preview", {
        bookId,
        fileName,
        fileBase64,
    });
}

export function confirmMoneyExcelImport(bookId: string, previewId: string) {
    return moneyPost<{ created: MoneyBatchIndexItem[], skippedSheets: string[] }>(
        "/misc/money/import/excel/confirm",
        {bookId, previewId}
    );
}

export const MONEY_ITEM_TYPES = [
    {value: "cash_account", label: "现金账户"},
    {value: "debt_account", label: "对账负债账户"},
    {value: "investment", label: "投资"},
    {value: "foreign_cash", label: "外币现钞"},
    {value: "foreign_exchange", label: "外币现汇"},
    {value: "crypto", label: "虚拟币"},
    {value: "fixed_asset", label: "固定资产"},
    {value: "liability", label: "负债"},
    {value: "receivable", label: "债权"},
];

export function itemTypeLabel(type: string) {
    return MONEY_ITEM_TYPES.find((item) => item.value === type)?.label || type || "未分类";
}

export function centsToYuan(value?: number) {
    return Number(((value || 0) / 100).toFixed(2));
}

export function yuanToCents(value: number | string | null | undefined) {
    const next = typeof value === "string" ? Number(value) : (value || 0);
    if (!Number.isFinite(next)) {
        return 0;
    }
    return Math.round(next * 100);
}

export function formatMoney(value?: number) {
    const num = (value || 0) / 100;
    return num.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatRate(value?: number) {
    return `${((value || 0) * 100).toFixed(2)}%`;
}

