import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAppActive} from "../shell/runtime";
import {Button, Dropdown, Empty, Input, Modal, Popconfirm, Spin, message} from "antd";
import type {MenuProps} from "antd";
import dayjs from "dayjs";
import {BarChartOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, MoreOutlined, PlusOutlined} from "@ant-design/icons";
import {createMoneyRecord, createMoneyBook, deleteMoneyBook, exportMoneyBookJson, getMoneyDashboard, importMoneyBookJson, listMoneyRecords, listMoneyBooks} from "./moneyApi";
import {MoneyBook, MoneySummary} from "./types";
import {MoneyShell, PageHeader, useIsAdmin} from "./components";
import {downloadJson, readFileAsText} from "./utils";
import {dashboardLatestSummary, loadAdminBookSummary} from "./summary";

function useBooks() {
    const [books, setBooks] = useState<MoneyBook[]>([]);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const ret = await listMoneyBooks();
            setBooks(ret.books || []);
        } catch {
            message.error("账本加载失败");
        } finally {
            setLoading(false);
        }
    }, []);
    return {books, loading, load, setBooks};
}

function formatBookCardMoney(value?: number) {
    const yuan = (value || 0) / 100;
    if (Math.abs(yuan) > 100000) {
        return `${(yuan / 10000).toFixed(3)}万`;
    }
    return yuan.toFixed(2);
}

function MoneyBookStat({label, value, primary = false}: { label: string, value: string, primary?: boolean }) {
    return <div className={`money-book-stat ${primary ? "is-primary" : ""}`}>
        <span>{label}</span>
        <strong>{value}</strong>
    </div>;
}

export function MoneyBookList() {
    const navigate = useNavigate();
    const isAdmin = useIsAdmin();
    const {books, loading, load} = useBooks();
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const [summaryByBook, setSummaryByBook] = useState<Record<string, MoneySummary>>({});
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState("家庭账本");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        load();
    }, [load]);
    // 保活：从别的应用切回来时刷新账本和汇总
    useAppActive(load);

    useEffect(() => {
        if (books.length === 0) {
            setSummaryByBook({});
            return;
        }
        let cancelled = false;
        Promise.all(books.map(async (book) => {
            try {
                const summary = isAdmin
                    ? await loadAdminBookSummary(book.id)
                    : dashboardLatestSummary(await getMoneyDashboard(book.id));
                return [book.id, summary] as const;
            } catch {
                return null;
            }
        })).then((items) => {
            if (cancelled) {
                return;
            }
            const next: Record<string, MoneySummary> = {};
            items.forEach((item) => {
                if (item && item[1]) {
                    next[item[0]] = item[1];
                }
            });
            setSummaryByBook(next);
        });
        return () => {
            cancelled = true;
        };
    }, [books, isAdmin]);

    const createBook = async () => {
        setSaving(true);
        try {
            const ret = await createMoneyBook(newName);
            setCreateOpen(false);
            message.success("账本已创建");
            navigate(`/money/${ret.book.id}/config`);
        } catch {
            message.error("创建失败");
        } finally {
            setSaving(false);
        }
    };

    const startRecord = async (bookId: string) => {
        try {
            const history = await listMoneyRecords(bookId);
            const today = dayjs().format("YYYY-MM-DD");
            const draft = (history.items || [])
                .filter((item) => item.status === "draft" && item.date === today)
                .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
            if (draft) {
                navigate(`/money/${bookId}/reconcile/${draft.id}`);
                return;
            }
            const ret = await createMoneyRecord({bookId, date: dayjs().format("YYYY-MM-DD")});
            navigate(`/money/${bookId}/reconcile/${ret.record.id}`);
        } catch {
            message.error("创建记录失败");
        }
    };

    const headerMenuItems: MenuProps["items"] = [
        {key: "import", label: "导入"},
    ];

    const handleHeaderMenuClick: MenuProps["onClick"] = ({key}) => {
        if (key === "import") {
            jsonInputRef.current?.click();
        }
    };

    const exportJson = async (book: MoneyBook) => {
        try {
            const ret = await exportMoneyBookJson(book.id);
            downloadJson(`${book.name || "money-book"}-${book.id}.json`, ret.archive);
            message.success("JSON 已导出");
        } catch {
            message.error("导出失败");
        }
    };

    const cardMenuItems: MenuProps["items"] = [
        {key: "import-excel", label: "导入"},
        {key: "export-json", label: "导出"},
    ];

    const handleCardMenuClick = (book: MoneyBook): MenuProps["onClick"] => ({key}) => {
        if (key === "import-excel") {
            navigate(`/money/${book.id}/import`);
        }
        if (key === "export-json") {
            exportJson(book);
        }
    };

    const importJson = async (file?: File) => {
        if (!file) {
            return;
        }
        try {
            const archive = JSON.parse(await readFileAsText(file));
            const ret = await importMoneyBookJson(archive);
            message.success("JSON 已导入");
            await load();
            navigate(`/money/${ret.book.id}/config`);
        } catch {
            message.error("导入失败，请检查 JSON 文件");
        } finally {
            if (jsonInputRef.current) {
                jsonInputRef.current.value = "";
            }
        }
    };

    const removeBook = async (book: MoneyBook) => {
        try {
            await deleteMoneyBook(book.id);
            message.success("账本已删除");
            await load();
        } catch {
            message.error("删除失败");
        }
    };

    return <MoneyShell>
        <PageHeader
            title="账本"
            extra={isAdmin ? <>
                <Button icon={<PlusOutlined/>} type="primary" onClick={() => setCreateOpen(true)}>新建账本</Button>
                <Dropdown menu={{items: headerMenuItems, onClick: handleHeaderMenuClick}} trigger={["click"]}>
                    <Button>其他</Button>
                </Dropdown>
                <input
                    ref={jsonInputRef}
                    className="money-hidden-file"
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => importJson(event.target.files?.[0])}
                />
            </> : null}
        />
        <Spin spinning={loading}>
            {books.length === 0 ? <div className="money-section"><Empty description="暂无可访问账本"/></div> : <div className="money-grid">
                {books.map((book) => {
                    const summary = summaryByBook[book.id];
                    return <div className="money-section money-book-card" key={book.id}>
                        <div className="money-section-title money-book-title">
                            <h2>{book.name}</h2>
                            {isAdmin ? <div className="money-book-title-actions">
                                <Button type="text" icon={<EditOutlined/>} aria-label="配置" onClick={() => navigate(`/money/${book.id}/config`)}/>
                                <Popconfirm
                                    title="删除后账本会从列表隐藏，继续吗？"
                                    okText="删除账本"
                                    cancelText="取消"
                                    onConfirm={() => removeBook(book)}
                                >
                                    <Button danger type="text" icon={<DeleteOutlined/>} aria-label="删除账本"/>
                                </Popconfirm>
                                <Dropdown menu={{items: cardMenuItems, onClick: handleCardMenuClick(book)}} trigger={["click"]}>
                                    <Button type="text" icon={<MoreOutlined/>} aria-label="其他"/>
                                </Dropdown>
                            </div> : null}
                        </div>
                        <div className="money-book-stats">
                            <MoneyBookStat label="净资产" value={formatBookCardMoney(summary?.netAssetCents)} primary/>
                            <MoneyBookStat label="资产" value={formatBookCardMoney(summary?.totalAssetCents)}/>
                            <MoneyBookStat label="负债" value={formatBookCardMoney(summary?.liabilityCents)}/>
                        </div>
                        <div className="money-card-actions">
                            <Button icon={<BarChartOutlined/>} onClick={() => navigate(`/money/${book.id}/dashboard`)}>看板</Button>
                            {isAdmin ? <Button onClick={() => startRecord(book.id)}>对账</Button> : null}
                            {isAdmin ? <Button icon={<HistoryOutlined/>} onClick={() => navigate(`/money/${book.id}/history`)}>历史</Button> : null}
                        </div>
                    </div>;
                })}
            </div>}
        </Spin>
        <Modal
            title="新建账本"
            open={createOpen}
            confirmLoading={saving}
            onOk={createBook}
            onCancel={() => setCreateOpen(false)}
        >
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="账本名称"/>
        </Modal>
    </MoneyShell>;
}
