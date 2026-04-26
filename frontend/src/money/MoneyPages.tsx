import {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
    Alert,
    Button,
    Checkbox,
    DatePicker,
    Dropdown,
    Empty,
    Input,
    InputNumber,
    Modal,
    Pagination,
    Popconfirm,
    Select,
    Space,
    Spin,
    Table,
    Tabs,
    Tag,
    message
} from "antd";
import type {ColumnsType} from "antd/es/table";
import type {MenuProps} from "antd";
import dayjs from "dayjs";
import {
    BarChartOutlined,
    CalculatorOutlined,
    CheckCircleOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    HistoryOutlined,
    HolderOutlined,
    MoreOutlined,
    PlusOutlined,
    SaveOutlined
} from "@ant-design/icons";
import {LoginCtx} from "../common/loginCtx";
import {useLoginGate} from "../common/useLoginGate";
import {
    centsToYuan,
    confirmMoneyRecord,
    confirmMoneyExcelImport,
    createMoneyRecord,
    createMoneyBook,
    deleteMoneyBook,
    deleteMoneyRecord,
    exportMoneyBookJson,
    formatMoney,
    formatRate,
    getMoneyRecord,
    getMoneyDashboard,
    grantMoneyDashboard,
    importMoneyBookJson,
    itemTypeLabel,
    listMoneyRecords,
    listMoneyBooks,
    listMoneyItems,
    previewMoneyExcelImport,
    updateMoneyRecord,
    updateMoneyBook,
    updateMoneyItems,
    yuanToCents
} from "./moneyApi";
import {
    MoneyRecordIndexItem,
    MoneyBook,
    MoneyDashboard,
    MoneyDashboardTrendItem,
    MoneyImportPreview,
    MoneyItem,
    MoneySummary,
    ReconciliationRecord,
    ReconciliationEntry
} from "./types";
import "./money.css";

function MoneyShell({children}: { children: ReactNode }) {
    return <div className="money-page">
        <main className="money-main">{children}</main>
    </div>;
}

function PageHeader({title, desc, extra}: { title: string, desc?: string, extra?: ReactNode }) {
    return <div className="money-header">
        <div className="money-title-block">
            <h1>{title}</h1>
            {desc ? <p>{desc}</p> : null}
        </div>
        {extra ? <div className="money-toolbar">{extra}</div> : null}
    </div>;
}

function useRequireLogin() {
    const gate = useLoginGate({enabled: true, autoPrompt: true});
    return gate;
}

function useIsAdmin() {
    const loginCtr = useContext(LoginCtx);
    return loginCtr.loginInfo.hasPermission("admin");
}

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

function StatusTag({status}: { status: string }) {
    if (status === "confirmed") {
        return <Tag color="success">已确认</Tag>;
    }
    return <Tag color="processing">草稿</Tag>;
}

function MoneyMetric({label, value}: { label: string, value: string }) {
    return <div className="money-metric">
        <div className="money-metric-label">{label}</div>
        <div className="money-metric-value">{value}</div>
    </div>;
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

function signedClass(value?: number) {
    if ((value || 0) > 0) {
        return "is-positive";
    }
    if ((value || 0) < 0) {
        return "is-negative";
    }
    return "";
}

function daysBetween(prevDate?: string, currentDate?: string) {
    if (!prevDate || !currentDate) {
        return null;
    }
    const prev = dayjs(prevDate);
    const current = dayjs(currentDate);
    if (!prev.isValid() || !current.isValid()) {
        return null;
    }
    const days = current.diff(prev, "day");
    return days > 0 ? days : null;
}

function downloadJson(fileName: string, data: object) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

export function MoneyBookList() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const isAdmin = useIsAdmin();
    const {books, loading, load} = useBooks();
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const [summaryByBook, setSummaryByBook] = useState<Record<string, MoneySummary>>({});
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState("家庭账本");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (gate.isLoggedIn) {
            load();
        }
    }, [gate.isLoggedIn, load]);

    useEffect(() => {
        if (!gate.isLoggedIn || books.length === 0) {
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
    }, [books, gate.isLoggedIn, isAdmin]);

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
        {gate.loginPanel}
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

function makeNewItem(bookId: string, sort: number): MoneyItem {
    return {
        id: `item-${Date.now()}-${sort}`,
        bookId,
        name: "",
        type: "",
        enabled: true,
        sort,
        includeInReconcile: false,
        includeInCash: false,
        includeInInvestmentProfit: false,
        includeInNetAsset: true,
        includeInLiability: false,
        note: "",
    };
}

function makeStarterItems(bookId: string): MoneyItem[] {
    return [
        {
            ...makeNewItem(bookId, 1),
            id: "cash-alipay",
            name: "支付宝",
            type: "cash_account",
            includeInReconcile: true,
            includeInCash: true,
            includeInNetAsset: true,
            note: "建议作为主平账账户",
        },
        {
            ...makeNewItem(bookId, 2),
            id: "cash-wechat",
            name: "微信",
            type: "cash_account",
            includeInReconcile: true,
            includeInCash: true,
            includeInNetAsset: true,
        },
        {
            ...makeNewItem(bookId, 3),
            id: "investment-fund",
            name: "基金",
            type: "investment",
            includeInInvestmentProfit: true,
            includeInNetAsset: true,
        },
        {
            ...makeNewItem(bookId, 4),
            id: "liability-loan",
            name: "贷款",
            type: "liability",
            includeInNetAsset: false,
            includeInLiability: true,
        },
    ];
}

function orderedStrings(values: string[]) {
    const seen = new Set<string>();
    const next: string[] = [];
    values.forEach((value) => {
        const item = value.trim();
        if (!item || seen.has(item)) {
            return;
        }
        seen.add(item);
        next.push(item);
    });
    return next;
}

function compactStrings(values: string[]) {
    return values.map((value) => value.trim()).filter(Boolean);
}

function EditableStringList({
    values,
    onChange,
    placeholder,
    disabled = false,
}: {
    values: string[]
    onChange: (values: string[]) => void
    placeholder: string
    disabled?: boolean
}) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const patch = (index: number, value: string) => {
        onChange(values.map((item, idx) => idx === index ? value : item));
    };
    const remove = (index: number) => {
        onChange(values.filter((_item, idx) => idx !== index));
    };
    const move = (from: number, to: number) => {
        if (from === to || from < 0 || to < 0 || from >= values.length || to >= values.length) {
            return;
        }
        const next = [...values];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
    };
    return <div className="money-list-editor">
        {values.map((value, index) => <div
            className={`money-list-editor-row ${dragIndex === index ? "is-dragging" : ""}`}
            key={index}
            onDragOver={(event) => {
                if (disabled || dragIndex === null) {
                    return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) {
                    move(dragIndex, index);
                }
                setDragIndex(null);
            }}
        >
            <Button
                className="money-list-drag-handle"
                type="text"
                disabled={disabled || values.length < 2}
                icon={<HolderOutlined/>}
                aria-label="拖动排序"
                draggable={!disabled && values.length > 1}
                onDragStart={(event) => {
                    setDragIndex(index);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                }}
                onDragEnd={() => setDragIndex(null)}
            />
            <Input disabled={disabled} value={value} placeholder={placeholder} onChange={(event) => patch(index, event.target.value)}/>
            <Button danger type="text" disabled={disabled} icon={<DeleteOutlined/>} aria-label="删除" onClick={() => remove(index)}/>
        </div>)}
        {!disabled ? <Button icon={<PlusOutlined/>} onClick={() => onChange([...values, ""])}>新增</Button> : null}
    </div>;
}

export function MoneyConfigPage() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const {bookId = ""} = useParams();
    const [book, setBook] = useState<MoneyBook | null>(null);
    const [items, setItems] = useState<MoneyItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewerUsers, setViewerUsers] = useState<string[]>([]);
    const [savedSnapshot, setSavedSnapshot] = useState("");

    const makeSnapshot = useCallback((nextBook: MoneyBook | null, nextItems: MoneyItem[], nextViewerUsers: string[]) => JSON.stringify({
        book: nextBook ? {
            name: nextBook.name,
            primaryBalanceAccountId: nextBook.primaryBalanceAccountId,
            enabled: nextBook.enabled,
        } : null,
        items: nextItems,
        viewerUsers: orderedStrings(nextViewerUsers),
    }), []);

    const dirty = useMemo(
        () => makeSnapshot(book, items, viewerUsers) !== savedSnapshot,
        [book, items, makeSnapshot, savedSnapshot, viewerUsers]
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [bookRet, itemRet] = await Promise.all([listMoneyBooks(), listMoneyItems(bookId)]);
            const nextBook = bookRet.books.find((item) => item.id === bookId) || null;
            const nextItems = itemRet.items || [];
            const nextViewerUsers = nextBook?.viewerUsers || [];
            setBook(nextBook);
            setViewerUsers(nextViewerUsers);
            setItems(nextItems);
            setSavedSnapshot(makeSnapshot(nextBook, nextItems, nextViewerUsers));
        } catch {
            message.error("配置加载失败");
        } finally {
            setLoading(false);
        }
    }, [bookId, makeSnapshot]);

    useEffect(() => {
        if (gate.isLoggedIn && bookId) {
            load();
        }
    }, [bookId, gate.isLoggedIn, load]);

    const patchItem = (index: number, patch: Partial<MoneyItem>) => {
        setItems((prev) => prev.map((item, idx) => idx === index ? {...item, ...patch} : item));
    };

    const backToList = () => {
        if (!dirty) {
            navigate("/money");
            return;
        }
        Modal.confirm({
            title: "配置尚未保存",
            content: "返回列表会丢弃当前未保存的配置修改，继续返回吗？",
            okText: "返回列表",
            cancelText: "继续编辑",
            onOk: () => navigate("/money"),
        });
    };

    const save = async () => {
        if (!book) {
            return;
        }
        setSaving(true);
        try {
            const nextViewerUsers = orderedStrings(viewerUsers);
            const bookRet = await updateMoneyBook({
                id: book.id,
                name: book.name,
                primaryBalanceAccountId: book.primaryBalanceAccountId,
                enabled: true,
                viewerUsers: nextViewerUsers,
            });
            const itemRet = await updateMoneyItems(book.id, items.map((item, index) => ({...item, sort: index + 1})));
            await grantMoneyDashboard(book.id, nextViewerUsers);
            setBook(bookRet.book);
            setViewerUsers(nextViewerUsers);
            const nextItems = itemRet.items || [];
            setItems(nextItems);
            setSavedSnapshot(makeSnapshot(bookRet.book, nextItems, nextViewerUsers));
            message.success("配置已保存");
        } catch {
            message.error("保存失败");
        } finally {
            setSaving(false);
        }
    };

    const columns: ColumnsType<MoneyItem> = [
        {
            title: "名称",
            dataIndex: "name",
            width: 160,
            render: (_, record, index) => <Input value={record.name} onChange={(e) => patchItem(index, {name: e.target.value})}/>,
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 160,
            render: (_, record, index) => <Input value={record.type} placeholder="如：现金、基金、房贷" onChange={(e) => patchItem(index, {type: e.target.value})}/>,
        },
        {
            title: "启用",
            dataIndex: "enabled",
            width: 72,
            render: (_, record, index) => <Checkbox checked={record.enabled} onChange={(e) => patchItem(index, {enabled: e.target.checked})}/>,
        },
        {
            title: "平账",
            dataIndex: "includeInReconcile",
            width: 72,
            render: (_, record, index) => <Checkbox checked={record.includeInReconcile} onChange={(e) => patchItem(index, {includeInReconcile: e.target.checked})}/>,
        },
        {
            title: "现金",
            dataIndex: "includeInCash",
            width: 72,
            render: (_, record, index) => <Checkbox checked={record.includeInCash} onChange={(e) => patchItem(index, {includeInCash: e.target.checked})}/>,
        },
        {
            title: "投资盈利",
            dataIndex: "includeInInvestmentProfit",
            width: 92,
            render: (_, record, index) => <Checkbox checked={record.includeInInvestmentProfit} onChange={(e) => patchItem(index, {includeInInvestmentProfit: e.target.checked})}/>,
        },
        {
            title: "净资产",
            dataIndex: "includeInNetAsset",
            width: 82,
            render: (_, record, index) => <Checkbox checked={record.includeInNetAsset} onChange={(e) => patchItem(index, {includeInNetAsset: e.target.checked})}/>,
        },
        {
            title: "负债",
            dataIndex: "includeInLiability",
            width: 72,
            render: (_, record, index) => <Checkbox checked={record.includeInLiability} onChange={(e) => patchItem(index, {includeInLiability: e.target.checked})}/>,
        },
        {
            title: "备注",
            dataIndex: "note",
            render: (_, record, index) => <Input value={record.note} onChange={(e) => patchItem(index, {note: e.target.value})}/>,
        },
        {
            title: "",
            width: 70,
            render: (_, _record, index) => <Button danger icon={<DeleteOutlined/>} onClick={() => setItems((prev) => prev.filter((_item, idx) => idx !== index))}/>,
        },
    ];

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader
            title="账本配置"
            desc={book?.name}
            extra={<>
                <Button onClick={backToList}>返回列表</Button>
                <Button icon={<SaveOutlined/>} type="primary" loading={saving} onClick={save}>保存配置</Button>
            </>}
        />
        <Spin spinning={loading}>
            {!book ? <div className="money-section"><Empty description="账本不存在"/></div> : <>
                <div className="money-section">
                    <div className="money-grid">
                        <label>
                            <div className="money-muted">账本名称</div>
                            <Input value={book.name} onChange={(e) => setBook({...book, name: e.target.value})}/>
                        </label>
                        <label>
                            <div className="money-muted">主平账账户</div>
                            <Select
                                style={{width: "100%"}}
                                value={book.primaryBalanceAccountId || undefined}
                                options={items.filter((item) => item.enabled).map((item) => ({value: item.id, label: item.name || itemTypeLabel(item.type)}))}
                                onChange={(value) => setBook({...book, primaryBalanceAccountId: value})}
                            />
                        </label>
                    </div>
                </div>
                <div className="money-section">
                    <div className="money-section-title">
                        <h2>项目配置</h2>
                        <div className="money-toolbar">
                            {items.length === 0 ? <Button onClick={() => {
                                const starters = makeStarterItems(book.id);
                                setItems(starters);
                                setBook({...book, primaryBalanceAccountId: starters[0].id});
                            }}>使用常用模板</Button> : null}
                            <Button icon={<PlusOutlined/>} onClick={() => setItems([...items, makeNewItem(book.id, items.length + 1)])}>新增项目</Button>
                        </div>
                    </div>
                    {items.length === 0 ? <Alert
                        style={{marginBottom: 12}}
                        type="info"
                        showIcon
                        message="先建立现金、投资、负债等项目，再创建对账记录。常用模板可作为第一版配置起点。"
                    /> : null}
                    <Alert
                        className="money-config-hint"
                        style={{marginBottom: 12}}
                        type="info"
                        showIcon
                        message="平账账户填写账面值和实际值；现金、投资盈利、净资产、负债决定汇总口径。"
                    />
                    <Table className="money-config-table" rowKey="id" columns={columns} dataSource={items} pagination={false} scroll={{x: 1100}}/>
                    <div className="money-config-cards">
                        {items.map((item, index) => <div className="money-config-card" key={item.id}>
                            <div className="money-config-card-head">
                                <strong>{item.name || "未命名项目"}</strong>
                                <Button danger type="text" icon={<DeleteOutlined/>} onClick={() => setItems((prev) => prev.filter((_item, idx) => idx !== index))}/>
                            </div>
                            <label>
                                <div className="money-muted">名称</div>
                                <Input value={item.name} onChange={(e) => patchItem(index, {name: e.target.value})}/>
                            </label>
                            <label>
                                <div className="money-muted">类型</div>
                                <Input value={item.type} placeholder="如：现金、基金、房贷" onChange={(e) => patchItem(index, {type: e.target.value})}/>
                            </label>
                            <div className="money-config-flags">
                                <Checkbox checked={item.enabled} onChange={(e) => patchItem(index, {enabled: e.target.checked})}>启用</Checkbox>
                                <Checkbox checked={item.includeInReconcile} onChange={(e) => patchItem(index, {includeInReconcile: e.target.checked})}>平账</Checkbox>
                                <Checkbox checked={item.includeInCash} onChange={(e) => patchItem(index, {includeInCash: e.target.checked})}>现金</Checkbox>
                                <Checkbox checked={item.includeInInvestmentProfit} onChange={(e) => patchItem(index, {includeInInvestmentProfit: e.target.checked})}>投资盈利</Checkbox>
                                <Checkbox checked={item.includeInNetAsset} onChange={(e) => patchItem(index, {includeInNetAsset: e.target.checked})}>净资产</Checkbox>
                                <Checkbox checked={item.includeInLiability} onChange={(e) => patchItem(index, {includeInLiability: e.target.checked})}>负债</Checkbox>
                            </div>
                            <label>
                                <div className="money-muted">备注</div>
                                <Input value={item.note} onChange={(e) => patchItem(index, {note: e.target.value})}/>
                            </label>
                        </div>)}
                    </div>
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>看板授权用户</h2></div>
                    <EditableStringList values={viewerUsers} onChange={setViewerUsers} placeholder="platform 用户名"/>
                </div>
            </>}
        </Spin>
    </MoneyShell>;
}

function normalizeInputCents(value: number, liability = false) {
    return liability ? -Math.abs(value || 0) : value;
}

function displayInputCents(value: number, liability = false) {
    return liability ? Math.abs(value || 0) : value;
}

function evaluateAmountExpression(expression: string): number | null {
    let index = 0;
    const input = expression.replace(/\s/g, "");
    const peek = () => input[index];
    const consume = (char: string) => {
        if (peek() === char) {
            index += 1;
            return true;
        }
        return false;
    };
    const parseNumber = (): number | null => {
        const start = index;
        while (/\d|\./.test(peek() || "")) {
            index += 1;
        }
        if (start === index) {
            return null;
        }
        const value = Number(input.slice(start, index));
        return Number.isFinite(value) ? value : null;
    };
    const parseFactor = (): number | null => {
        if (consume("+")) {
            return parseFactor();
        }
        if (consume("-")) {
            const value = parseFactor();
            return value === null ? null : -value;
        }
        if (consume("(")) {
            const value = parseExpression();
            if (value === null || !consume(")")) {
                return null;
            }
            return value;
        }
        return parseNumber();
    };
    const parseTerm = (): number | null => {
        let value = parseFactor();
        while (value !== null && (peek() === "*" || peek() === "/")) {
            const op = peek();
            index += 1;
            const right = parseFactor();
            if (right === null || (op === "/" && right === 0)) {
                return null;
            }
            value = op === "*" ? value * right : value / right;
        }
        return value;
    };
    const parseExpression = (): number | null => {
        let value = parseTerm();
        while (value !== null && (peek() === "+" || peek() === "-")) {
            const op = peek();
            index += 1;
            const right = parseTerm();
            if (right === null) {
                return null;
            }
            value = op === "+" ? value + right : value - right;
        }
        return value;
    };
    if (!input) {
        return null;
    }
    const result = parseExpression();
    if (result === null || index !== input.length || !Number.isFinite(result)) {
        return null;
    }
    return result;
}

function openAmountExpressionModal(value: number, onChange: (value: number) => void, liability = false) {
    let expression = String(displayInputCents(centsToYuan(value), liability));
    Modal.confirm({
        title: "表达式输入",
        content: <Input
            autoFocus
            defaultValue={expression}
            placeholder="例如：200-90"
            onChange={(event) => {
                expression = event.target.value;
            }}
        />,
        okText: "应用",
        cancelText: "取消",
        onOk: () => {
            const result = evaluateAmountExpression(expression);
            if (result === null) {
                message.error("表达式格式不正确");
                return Promise.reject();
            }
            onChange(normalizeInputCents(yuanToCents(result), liability));
            return undefined;
        },
    });
}

function entryAmountInput(value: number, onChange: (value: number) => void, options: { liability?: boolean } = {}) {
    const liability = Boolean(options.liability);
    return <div className="money-amount-editor">
        <InputNumber
            className="money-table-input"
            value={centsToYuan(displayInputCents(value, liability))}
            precision={2}
            onChange={(next) => onChange(normalizeInputCents(yuanToCents(next), liability))}
        />
        <Button
            className="money-expression-button"
            icon={<CalculatorOutlined/>}
            aria-label="表达式输入"
            onClick={() => openAmountExpressionModal(value, onChange, liability)}
        />
    </div>;
}

function displayAmountOrDash(enabled: boolean, value: number) {
    return enabled ? formatMoney(value) : "--";
}

function sourceLabel(source: string) {
    const labels: Record<string, string> = {
        manual: "手动录入",
        mannual: "手动录入",
        excel_import: "Excel 导入",
    };
    return labels[source] || source || "未知";
}

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

function signedEntryValue(entry: ReconciliationEntry, item: MoneyItem | undefined, value: number) {
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

function computeReconcileSummary(entries: ReconciliationEntry[], itemById: Map<string, MoneyItem>, hasPreviousRecord: boolean): MoneySummary {
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
            summary.investmentProfitCents += currentValue - previousValue;
            if (currentValue === 0) {
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

function sortRecordsAsc(records: ReconciliationRecord[]) {
    return [...records].sort((a, b) => {
        if (a.date === b.date) {
            return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
        }
        return String(a.date || "").localeCompare(String(b.date || ""));
    });
}

function summarizeRecord(record: ReconciliationRecord | null | undefined, items: MoneyItem[], hasPreviousRecord: boolean) {
    return computeReconcileSummary(record?.entries || [], moneyItemMap(items), hasPreviousRecord);
}

function dashboardLatestSummary(dashboard: MoneyDashboard | undefined) {
    const records = sortRecordsAsc(dashboard?.records || []);
    const latest = records[records.length - 1];
    if (!latest) {
        return undefined;
    }
    return summarizeRecord(latest, dashboard?.items || [], records.length > 1);
}

function dashboardTrendItems(dashboard: MoneyDashboard | null): MoneyDashboardTrendItem[] {
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

async function loadAdminBookSummary(bookId: string) {
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

async function loadAdminDashboardFallback(bookId: string, dashboard: MoneyDashboard) {
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

export function MoneyReconcilePage() {
    const gate = useRequireLogin();
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
        if (gate.isLoggedIn && bookId && recordId) {
            load();
        }
    }, [recordId, bookId, gate.isLoggedIn, load]);

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
                if (!investmentItemIds.has(entry.itemId) || entry.changeCents === 0) {
                    return;
                }
                suggestions.push({
                    id: `investment-${entry.itemId}`,
                    type: entry.changeCents > 0 ? "investment_gain" : "investment_loss",
                    fromItemId: entry.changeCents > 0 ? "" : entry.itemId,
                    fromItemName: entry.changeCents > 0 ? "投资盈利" : entry.itemNameSnapshot,
                    toItemId: entry.changeCents > 0 ? entry.itemId : "",
                    toItemName: entry.changeCents > 0 ? entry.itemNameSnapshot : "投资亏损",
                    bookValueCents: entry.previousValueCents,
                    actualValueCents: entry.currentValueCents,
                    diffCents: Math.abs(entry.changeCents),
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
            render: (value, record) => hasPreviousRecord && isInvestmentEntry(record) ? <div className="money-amount">{formatMoney(value)}</div> : <span className="money-muted">--</span>,
        },
        {
            title: "年化",
            dataIndex: "annualizedRate",
            width: 100,
            render: (value, record) => hasPreviousRecord && isInvestmentEntry(record) ? formatRate(value) : <span className="money-muted">--</span>,
        },
    ];

    return <MoneyShell>
        {gate.loginPanel}
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
                    <Table className="money-reconcile-table" rowKey="itemId" columns={columns} dataSource={record.entries || []} pagination={false} scroll={{x: 880}}/>
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
                                <span>变化</span><strong>{displayAmountOrDash(hasPreviousRecord && isInvestmentEntry(entry), entry.changeCents)}</strong>
                                <span>年化</span><strong>{hasPreviousRecord && isInvestmentEntry(entry) ? formatRate(entry.annualizedRate) : "--"}</strong>
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

function DashboardSummary({summary, latestDate}: { summary: MoneySummary, latestDate: string }) {
    return <div className="money-dashboard-summary">
        <div className="money-hero-metric">
            <div className="money-metric-label">当前净资产</div>
            <div className={`money-hero-value ${signedClass(summary.netAssetCents)}`}>{formatMoney(summary.netAssetCents)}</div>
            <div className="money-hero-sub">
                <span>较上期 <strong className={signedClass(summary.netAssetChangeCents)}>{formatMoney(summary.netAssetChangeCents)}</strong></span>
                <span>最新记录 {latestDate || "暂无"}</span>
            </div>
        </div>
        <div className="money-dashboard-metrics">
            <MoneyMetric label="现金" value={formatMoney(summary.cashCents)}/>
            <MoneyMetric label="总资产" value={formatMoney(summary.totalAssetCents)}/>
            <MoneyMetric label="负债" value={formatMoney(summary.liabilityCents)}/>
            <MoneyMetric label="投资盈利" value={formatMoney(summary.investmentProfitCents)}/>
            <MoneyMetric label="净资产负债率" value={formatRate(summary.netAssetLiabilityRate)}/>
            <MoneyMetric label="资产负债率" value={formatRate(summary.assetLiabilityRate)}/>
        </div>
    </div>;
}

export function MoneyHistoryPage() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const {bookId = ""} = useParams();
    const [items, setItems] = useState<MoneyRecordIndexItem[]>([]);
    const [recordSummaries, setRecordSummaries] = useState<Record<string, MoneySummary>>({});
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ret, itemRet] = await Promise.all([
                listMoneyRecords(bookId),
                listMoneyItems(bookId),
            ]);
            setItems(ret.items || []);
            const detailResults = await Promise.all((ret.items || []).map(async (item) => {
                try {
                    const detail = await getMoneyRecord(bookId, item.id);
                    return detail.record;
                } catch {
                    return null;
                }
            }));
            const detailsById = new Map(detailResults.filter(Boolean).map((record) => [record!.id, record!]));
            const confirmed = sortRecordsAsc(detailResults.filter((record): record is ReconciliationRecord => Boolean(record && record.status === "confirmed")));
            const confirmedIndexById = new Map(confirmed.map((record, index) => [record.id, index]));
            const summaries: Record<string, MoneySummary> = {};
            (ret.items || []).forEach((item) => {
                const record = detailsById.get(item.id);
                if (!record) {
                    return;
                }
                const confirmedIndex = confirmedIndexById.get(record.id);
                const hasPreviousRecord = confirmedIndex !== undefined
                    ? confirmedIndex > 0
                    : confirmed.some((confirmedRecord) => confirmedRecord.date < record.date);
                summaries[item.id] = summarizeRecord(record, itemRet.items || [], hasPreviousRecord);
            });
            setRecordSummaries(summaries);
        } catch {
            message.error("历史加载失败");
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        if (gate.isLoggedIn && bookId) {
            load();
        }
    }, [bookId, gate.isLoggedIn, load]);

    const createDraft = async (copyFromRecordId?: string) => {
        try {
            if (!copyFromRecordId) {
                const today = dayjs().format("YYYY-MM-DD");
                const draft = (items || [])
                    .filter((item) => item.status === "draft" && item.date === today)
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
                if (draft) {
                    navigate(`/money/${bookId}/reconcile/${draft.id}`);
                    return;
                }
            }
            const ret = await createMoneyRecord({bookId, date: dayjs().format("YYYY-MM-DD"), copyFromRecordId});
            navigate(`/money/${bookId}/reconcile/${ret.record.id}`);
        } catch {
            message.error("创建草稿失败");
        }
    };

    const removeDraft = async (recordId: string) => {
        try {
            await deleteMoneyRecord(bookId, recordId);
            message.success("草稿已删除");
            await load();
        } catch {
            message.error("删除失败");
        }
    };

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader
            title="历史记录"
            extra={<>
                <Button onClick={() => navigate("/money")}>返回列表</Button>
                <Button type="primary" icon={<PlusOutlined/>} onClick={() => createDraft()}>新建对账</Button>
            </>}
        />
        <div className="money-section">
            <Table
                className="money-history-table"
                rowKey="id"
                loading={loading}
                dataSource={items}
                pagination={false}
                columns={[
                    {title: "日期", dataIndex: "date", width: 130},
                    {title: "状态", dataIndex: "status", width: 100, render: (value) => <StatusTag status={value}/>},
                    {title: "净资产", render: (_, record) => <div className="money-amount">{formatMoney(recordSummaries[record.id]?.netAssetCents)}</div>},
                    {title: "净资产变化", render: (_, record) => <div className="money-amount">{record.status === "confirmed" ? formatMoney(recordSummaries[record.id]?.netAssetChangeCents) : "--"}</div>},
                    {title: "投资盈利", render: (_, record) => <div className="money-amount">{record.status === "confirmed" ? formatMoney(recordSummaries[record.id]?.investmentProfitCents) : "--"}</div>},
                    {title: "资产负债率", render: (_, record) => formatRate(recordSummaries[record.id]?.assetLiabilityRate)},
                    {title: "创建方式", dataIndex: "source", width: 120, render: (value) => sourceLabel(value)},
                    {
                        title: "操作",
                        width: 190,
                        render: (_, record) => <Space>
                            <Button size="small" onClick={() => navigate(`/money/${bookId}/reconcile/${record.id}`)}>查看详情</Button>
                            {record.status === "draft" ? <Popconfirm title="删除后草稿不可恢复，继续吗？" okText="删除草稿" cancelText="取消" onConfirm={() => removeDraft(record.id)}><Button size="small" danger>删除</Button></Popconfirm> : null}
                            {record.status === "confirmed" ? <Button size="small" icon={<CopyOutlined/>} onClick={() => createDraft(record.id)}>基于此对账</Button> : null}
                        </Space>,
                    },
                ]}
            />
            <div className="money-history-cards">
                {items.map((record) => {
                    const summary = recordSummaries[record.id];
                    return <div className="money-history-card" key={record.id}>
                    <div className="money-history-card-head">
                        <strong>{record.date}</strong>
                        <StatusTag status={record.status}/>
                    </div>
                    <div className="money-history-card-grid">
                        <span>净资产</span><strong className={signedClass(summary?.netAssetCents)}>{formatMoney(summary?.netAssetCents)}</strong>
                        <span>净资产变化</span><strong className={record.status === "confirmed" ? signedClass(summary?.netAssetChangeCents) : ""}>{record.status === "confirmed" ? formatMoney(summary?.netAssetChangeCents) : "--"}</strong>
                        <span>投资盈利</span><strong>{record.status === "confirmed" ? formatMoney(summary?.investmentProfitCents) : "--"}</strong>
                        <span>资产负债率</span><strong>{formatRate(summary?.assetLiabilityRate)}</strong>
                    </div>
                    <div className="money-toolbar">
                        <Button size="small" onClick={() => navigate(`/money/${bookId}/reconcile/${record.id}`)}>查看详情</Button>
                        {record.status === "draft" ? <Popconfirm title="删除后草稿不可恢复，继续吗？" okText="删除草稿" cancelText="取消" onConfirm={() => removeDraft(record.id)}><Button size="small" danger>删除</Button></Popconfirm> : null}
                        {record.status === "confirmed" ? <Button size="small" icon={<CopyOutlined/>} onClick={() => createDraft(record.id)}>基于此对账</Button> : null}
                    </div>
                </div>;
                })}
            </div>
        </div>
    </MoneyShell>;
}

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

function buildNetAssetTree(record: ReconciliationRecord | null, items: MoneyItem[], summary: MoneySummary): MoneyStructureNode {
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

function buildStructureTree(params: {
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

function StructureTree({root}: { root: MoneyStructureNode }) {
    if (!root.children?.length) {
        return <Empty description="暂无结构数据"/>;
    }
    return <div className="money-structure-tree">
        <StructureNodeRow node={root} level={0}/>
    </div>;
}

function TrendLine({values}: { values: MoneyDashboardTrendItem[] }) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    if (!values.length) {
        return <Empty description="暂无趋势数据"/>;
    }
    const width = 760;
    const height = 260;
    const padding = {top: 24, right: 28, bottom: 40, left: 72};
    const minValue = Math.min(...values.map((item) => item.netAssetCents), 0);
    const maxValue = Math.max(...values.map((item) => item.netAssetCents), 0);
    const range = maxValue - minValue || 1;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const points = values.map((item, index) => {
        const x = padding.left + (values.length === 1 ? plotWidth / 2 : index / (values.length - 1) * plotWidth);
        const y = padding.top + (maxValue - item.netAssetCents) / range * plotHeight;
        return {...item, x, y};
    });
    const linePath = points.map((item, index) => `${index === 0 ? "M" : "L"} ${item.x} ${item.y}`).join(" ");
    const zeroY = padding.top + (maxValue - 0) / range * plotHeight;
    const hoverPoint = hoverIndex === null ? null : points[hoverIndex];
    const tooltipClass = hoverPoint ? [
        "money-line-tooltip",
        hoverPoint.x > width * 0.72 ? "is-left" : "is-right",
        hoverPoint.y < height * 0.34 ? "is-below" : "is-above",
    ].join(" ") : "";
    return <div>
        <div className="money-line-chart">
            <div className="money-line-scroll">
                <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="净资产历史趋势折线图">
                    <line className="money-line-axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom}/>
                    <line className="money-line-axis" x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom}/>
                    <line className="money-line-zero" x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY}/>
                    <text className="money-line-scale" x={padding.left - 10} y={padding.top + 4} textAnchor="end">{formatMoney(maxValue)}</text>
                    <text className="money-line-scale" x={padding.left - 10} y={height - padding.bottom + 4} textAnchor="end">{formatMoney(minValue)}</text>
                    <path className="money-line-path" d={linePath}/>
                    {points.map((item, index) => <g key={`${item.date}-${index}`}>
                        <circle
                            className={`money-line-point ${hoverIndex === index ? "is-active" : ""}`}
                            cx={item.x}
                            cy={item.y}
                            r={hoverIndex === index ? 6 : 4}
                            tabIndex={0}
                            onMouseEnter={() => setHoverIndex(index)}
                            onMouseLeave={() => setHoverIndex(null)}
                            onFocus={() => setHoverIndex(index)}
                            onBlur={() => setHoverIndex(null)}
                            onClick={() => setHoverIndex(index)}
                            onTouchStart={() => setHoverIndex(index)}
                        />
                        <text className="money-line-date" x={item.x} y={height - 14} textAnchor="middle">{item.date.slice(5)}</text>
                    </g>)}
                </svg>
            </div>
            {hoverPoint ? <div className={tooltipClass} style={{left: `${hoverPoint.x / width * 100}%`, top: `${hoverPoint.y / height * 100}%`}}>
                <strong>{hoverPoint.date}</strong>
                <span>净资产 {formatMoney(hoverPoint.netAssetCents)}</span>
                <span>总资产 {formatMoney(hoverPoint.totalAssetCents)}</span>
                <span>负债 {formatMoney(hoverPoint.liabilityCents)}</span>
                <span>现金 {formatMoney(hoverPoint.cashCents)}</span>
            </div> : null}
        </div>
        <div className="money-trend-list">
            {values.slice().reverse().map((item, index) => <div className="money-trend-list-row" key={`${item.date}-${index}`}>
                <span>{item.date}</span>
                <strong className={signedClass(item.netAssetCents)}>{formatMoney(item.netAssetCents)}</strong>
            </div>)}
        </div>
    </div>;
}

function DashboardEvents({dashboard}: { dashboard: MoneyDashboard }) {
    const pageSize = 5;
    const [currentPage, setCurrentPage] = useState(1);
    const events = useMemo(() => (dashboard.events || [])
        .map((event, index) => ({event, index}))
        .filter((item) => String(item.event.content || "").trim() !== "")
        .sort((a, b) => String(b.event.date || "").localeCompare(String(a.event.date || "")) || a.index - b.index)
        .map((item) => item.event), [dashboard.events]);
    const pageCount = Math.max(1, Math.ceil(events.length / pageSize));
    const page = Math.min(currentPage, pageCount);
    const pageEvents = events.slice((page - 1) * pageSize, page * pageSize);
    useEffect(() => {
        setCurrentPage(1);
    }, [dashboard.events]);
    if (!events.length) {
        return <Empty description="暂无大事记"/>;
    }
    return <div className="money-event-list">
        {pageEvents.map((event) => <div className="money-event-item" key={event.id || `${event.date}-${event.content}`}>
            <div className="money-event-date">{event.date}</div>
            <div className="money-event-content">{event.content}</div>
        </div>)}
        {events.length > pageSize ? <Pagination
            className="money-event-pagination"
            current={page}
            pageSize={pageSize}
            total={events.length}
            showSizeChanger={false}
            onChange={setCurrentPage}
        /> : null}
    </div>;
}

export function MoneyDashboardPage() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const {bookId = ""} = useParams();
    const isAdmin = useIsAdmin();
    const [dashboard, setDashboard] = useState<MoneyDashboard | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const nextDashboard = await getMoneyDashboard(bookId);
            setDashboard(isAdmin ? await loadAdminDashboardFallback(bookId, nextDashboard) : nextDashboard);
        } catch {
            message.error("看板加载失败");
        } finally {
            setLoading(false);
        }
    }, [bookId, isAdmin]);

    useEffect(() => {
        if (gate.isLoggedIn && bookId) {
            load();
        }
    }, [bookId, gate.isLoggedIn, load]);

    const dashboardRecords = useMemo(() => sortRecordsAsc(dashboard?.records || []), [dashboard?.records]);
    const latestRecord = dashboardRecords[dashboardRecords.length - 1] || null;
    const dashboardSummary = useMemo(() => summarizeRecord(latestRecord, dashboard?.items || [], dashboardRecords.length > 1), [dashboard?.items, dashboardRecords.length, latestRecord]);
    const trends = useMemo(() => dashboardTrendItems(dashboard), [dashboard]);

    const assetTree = useMemo(() => buildStructureTree({
        rootName: "资产合计",
        mode: "asset",
        record: latestRecord,
        items: dashboard?.items || [],
    }), [dashboard?.items, latestRecord]);

    const liabilityTree = useMemo(() => buildStructureTree({
        rootName: "负债合计",
        mode: "liability",
        record: latestRecord,
        items: dashboard?.items || [],
    }), [dashboard?.items, latestRecord]);

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader title={dashboard?.book?.name || "家庭账本看板"} desc={dashboard?.latestDate ? `最新确认记录：${dashboard.latestDate}` : "暂无确认记录"} extra={<Button onClick={() => navigate("/money")}>返回列表</Button>}/>
        <Spin spinning={loading}>
            {!dashboard ? <div className="money-section"><Empty description="暂无看板数据"/></div> : <>
                {!dashboard.latestRecordId ? <div className="money-section money-empty-action">
                    <Empty description="暂无确认记录"/>
                    <Button type="primary" onClick={() => navigate(`/money/${bookId}/history`)}>去完成首次对账</Button>
                </div> : <>
                    <DashboardSummary summary={dashboardSummary} latestDate={dashboard.latestDate}/>
                    <div className="money-section money-dashboard-panel">
                        <Tabs
                            items={[
                                {key: "trend", label: "历史趋势", children: <TrendLine values={trends}/>},
                                {key: "asset", label: "资产结构", children: <StructureTree root={assetTree}/>},
                                {key: "liability", label: "负债结构", children: <StructureTree root={liabilityTree}/>},
                            ]}
                        />
                    </div>
                    <div className="money-section">
                        <div className="money-section-title"><h2>大事记</h2></div>
                        <DashboardEvents dashboard={dashboard}/>
                    </div>
                </>}
            </>}
        </Spin>
    </MoneyShell>;
}

function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export function MoneyImportPage() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const {bookId = ""} = useParams();
    const [preview, setPreview] = useState<MoneyImportPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const onFile = async (file?: File) => {
        if (!file) {
            return;
        }
        setLoading(true);
        try {
            const dataUrl = await readFileAsDataURL(file);
            const ret = await previewMoneyExcelImport(bookId, file.name, dataUrl);
            setPreview(ret.preview);
            message.success("预览已生成");
        } catch {
            message.error("导入预览失败");
        } finally {
            setLoading(false);
        }
    };

    const confirm = async () => {
        if (!preview) {
            return;
        }
        setConfirming(true);
        try {
            const ret = await confirmMoneyExcelImport(bookId, preview.id);
            message.success(`创建 ${ret.created.length} 个记录，跳过 ${ret.skippedSheets.length} 个 sheet`);
            navigate(`/money/${bookId}/history`);
        } catch {
            message.error("确认导入失败");
        } finally {
            setConfirming(false);
        }
    };

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader
            title="Excel 历史导入"
            desc="先预览识别结果，再确认写入历史记录"
            extra={<Button onClick={() => navigate(`/money/${bookId}/history`)}>记录历史</Button>}
        />
        <div className="money-section">
            <Spin spinning={loading}>
                <input type="file" accept=".xlsx" onChange={(event) => onFile(event.target.files?.[0])}/>
                {preview?.warnings?.length ? <Alert style={{marginTop: 12}} type="warning" showIcon message={preview.warnings.join("；")}/> : null}
            </Spin>
        </div>
        {preview ? <div className="money-section">
            <div className="money-section-title">
                <h2>导入预览：{preview.fileName}</h2>
                <Button type="primary" loading={confirming} onClick={confirm}>确认导入</Button>
            </div>
            <Table
                rowKey="sheetName"
                dataSource={preview.sheets}
                pagination={false}
                columns={[
                    {title: "Sheet", dataIndex: "sheetName"},
                    {title: "日期", dataIndex: "date"},
                    {title: "状态", dataIndex: "valid", render: (value) => value ? <Tag color="success">可导入</Tag> : <Tag color="error">异常</Tag>},
                    {title: "现金", dataIndex: ["summary", "cashCents"], render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                    {title: "净资产", dataIndex: ["summary", "netAssetCents"], render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                    {title: "负债", dataIndex: ["summary", "liabilityCents"], render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                    {title: "提示", dataIndex: "warnings", render: (value: string[]) => value?.join("；") || ""},
                ]}
            />
        </div> : null}
    </MoneyShell>;
}
