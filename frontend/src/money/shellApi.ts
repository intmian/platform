// 记账给外壳（桌面小组件）用的接口，外壳按需动态引入。汇总口径和账本列表页一致。
import {getMoneyDashboard, listMoneyBooks} from "./moneyApi";
import {dashboardLatestSummary, loadAdminBookSummary} from "./summary";

export interface BookDigest {
    id: string;
    name: string;
    netAssetCents: number;
    changeCents?: number; // 和上一次对账相比
}

export async function loadBookDigest(isAdmin: boolean): Promise<BookDigest[]> {
    const {books} = await listMoneyBooks();
    const list = (books || []).filter((b) => b.enabled !== false && !b.deleted);
    const rows = await Promise.all(list.map(async (book): Promise<BookDigest | null> => {
        try {
            const summary = isAdmin
                ? await loadAdminBookSummary(book.id)
                : dashboardLatestSummary(await getMoneyDashboard(book.id));
            if (!summary) return null;
            return {
                id: book.id,
                name: book.name,
                netAssetCents: summary.netAssetCents,
                changeCents: summary.netAssetChangeCents,
            };
        } catch {
            return null;
        }
    }));
    return rows.filter((r): r is BookDigest => !!r);
}
