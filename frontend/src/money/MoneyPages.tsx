import {useCallback, useContext, useEffect, useState} from "react";
import type {ReactNode} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
    Alert,
    Button,
    Checkbox,
    DatePicker,
    Empty,
    Input,
    InputNumber,
    Modal,
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
import dayjs from "dayjs";
import {
    BarChartOutlined,
    CheckCircleOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    FileExcelOutlined,
    PlusOutlined,
    SaveOutlined
} from "@ant-design/icons";
import {LoginCtx} from "../common/loginCtx";
import {useLoginGate} from "../common/useLoginGate";
import {
    centsToYuan,
    computeMoneyBatch,
    confirmMoneyBatch,
    confirmMoneyExcelImport,
    createMoneyBatch,
    createMoneyBook,
    formatMoney,
    formatRate,
    getMoneyBatch,
    getMoneyDashboard,
    grantMoneyDashboard,
    itemTypeLabel,
    listMoneyBatches,
    listMoneyBooks,
    listMoneyItems,
    MONEY_ITEM_TYPES,
    previewMoneyExcelImport,
    updateMoneyBatch,
    updateMoneyBook,
    updateMoneyItems,
    yuanToCents
} from "./moneyApi";
import {
    MoneyBatchIndexItem,
    MoneyBook,
    MoneyDashboard,
    MoneyImportPreview,
    MoneyItem,
    MoneySummary,
    ReconciliationBatch,
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

function signedClass(value?: number) {
    if ((value || 0) > 0) {
        return "is-positive";
    }
    if ((value || 0) < 0) {
        return "is-negative";
    }
    return "";
}

export function MoneyBookList() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const isAdmin = useIsAdmin();
    const {books, loading, load} = useBooks();
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState("家庭账本");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (gate.isLoggedIn) {
            load();
        }
    }, [gate.isLoggedIn, load]);

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

    const startBatch = async (bookId: string) => {
        try {
            const ret = await createMoneyBatch({bookId, date: dayjs().format("YYYY-MM-DD")});
            navigate(`/money/${bookId}/reconcile/${ret.batch.id}`);
        } catch {
            message.error("创建批次失败");
        }
    };

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader
            title="家庭账本"
            desc={isAdmin ? "配置账本、录入对账批次、查看看板" : "查看已授权的家庭账本看板"}
            extra={isAdmin ? <Button icon={<PlusOutlined/>} type="primary" onClick={() => setCreateOpen(true)}>新建账本</Button> : null}
        />
        <Spin spinning={loading}>
            {books.length === 0 ? <div className="money-section"><Empty description="暂无可访问账本"/></div> : <div className="money-grid">
                {books.map((book) => <div className="money-section" key={book.id}>
                    <div className="money-section-title">
                        <h2>{book.name}</h2>
                        {book.enabled ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>}
                    </div>
                    <div className="money-muted">看板用户：{book.viewerUsers?.length ? book.viewerUsers.join(", ") : "未授权"}</div>
                    <div className="money-toolbar" style={{marginTop: 14}}>
                        <Button icon={<BarChartOutlined/>} onClick={() => navigate(`/money/${book.id}/dashboard`)}>看板</Button>
                        {isAdmin ? <Button icon={<EditOutlined/>} onClick={() => navigate(`/money/${book.id}/config`)}>配置</Button> : null}
                        {isAdmin ? <Button onClick={() => startBatch(book.id)}>新建对账</Button> : null}
                        {isAdmin ? <Button onClick={() => navigate(`/money/${book.id}/history`)}>批次历史</Button> : null}
                        {isAdmin ? <Button icon={<FileExcelOutlined/>} onClick={() => navigate(`/money/${book.id}/import`)}>导入</Button> : null}
                    </div>
                </div>)}
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
        type: "cash_account",
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

export function MoneyConfigPage() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const {bookId = ""} = useParams();
    const [book, setBook] = useState<MoneyBook | null>(null);
    const [items, setItems] = useState<MoneyItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewerText, setViewerText] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [bookRet, itemRet] = await Promise.all([listMoneyBooks(), listMoneyItems(bookId)]);
            const nextBook = bookRet.books.find((item) => item.id === bookId) || null;
            setBook(nextBook);
            setViewerText((nextBook?.viewerUsers || []).join("\n"));
            setItems(itemRet.items || []);
        } catch {
            message.error("配置加载失败");
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        if (gate.isLoggedIn && bookId) {
            load();
        }
    }, [bookId, gate.isLoggedIn, load]);

    const patchItem = (index: number, patch: Partial<MoneyItem>) => {
        setItems((prev) => prev.map((item, idx) => idx === index ? {...item, ...patch} : item));
    };

    const save = async () => {
        if (!book) {
            return;
        }
        setSaving(true);
        try {
            const viewerUsers = viewerText.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
            const bookRet = await updateMoneyBook({
                id: book.id,
                name: book.name,
                primaryBalanceAccountId: book.primaryBalanceAccountId,
                enabled: book.enabled,
                viewerUsers,
            });
            const itemRet = await updateMoneyItems(book.id, items.map((item, index) => ({...item, sort: index + 1})));
            await grantMoneyDashboard(book.id, viewerUsers);
            setBook(bookRet.book);
            setItems(itemRet.items || []);
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
            render: (_, record, index) => <Select
                style={{width: 150}}
                value={record.type}
                options={MONEY_ITEM_TYPES}
                onChange={(value) => patchItem(index, {type: value})}
            />,
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
                <Button onClick={() => navigate("/money")}>返回列表</Button>
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
                        <label>
                            <div className="money-muted">状态</div>
                            <Checkbox checked={book.enabled} onChange={(e) => setBook({...book, enabled: e.target.checked})}>启用</Checkbox>
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
                        message="先建立现金、投资、负债等项目，再创建对账批次。常用模板可作为第一版配置起点。"
                    /> : null}
                    <Table rowKey="id" columns={columns} dataSource={items} pagination={false} scroll={{x: 1100}}/>
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>看板授权用户</h2></div>
                    <Input.TextArea
                        rows={4}
                        value={viewerText}
                        onChange={(e) => setViewerText(e.target.value)}
                        placeholder="每行一个 platform 用户名"
                    />
                </div>
            </>}
        </Spin>
    </MoneyShell>;
}

function entryAmountInput(value: number, onChange: (value: number) => void) {
    return <InputNumber
        className="money-table-input"
        value={centsToYuan(value)}
        precision={2}
        onChange={(next) => onChange(yuanToCents(next))}
    />;
}

export function MoneyReconcilePage() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const {bookId = "", batchId = ""} = useParams();
    const [batch, setBatch] = useState<ReconciliationBatch | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [eventText, setEventText] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const ret = await getMoneyBatch(bookId, batchId);
            setBatch(ret.batch);
            setEventText((ret.batch.events || []).map((event) => event.content).join("\n"));
        } catch {
            message.error("批次加载失败");
        } finally {
            setLoading(false);
        }
    }, [batchId, bookId]);

    useEffect(() => {
        if (gate.isLoggedIn && bookId && batchId) {
            load();
        }
    }, [batchId, bookId, gate.isLoggedIn, load]);

    const readonly = batch?.status === "confirmed";

    const patchEntry = (index: number, patch: Partial<ReconciliationEntry>) => {
        setBatch((prev) => prev ? {
            ...prev,
            entries: prev.entries.map((entry, idx) => idx === index ? {...entry, ...patch} : entry),
        } : prev);
    };

    const materializeEvents = (next: ReconciliationBatch) => ({
        ...next,
        events: eventText.split("\n").map((content) => content.trim()).filter(Boolean).map((content, index) => ({
            id: next.events?.[index]?.id || "",
            date: next.date,
            content,
        })),
    });

    const save = async () => {
        if (!batch || readonly) {
            return batch;
        }
        setSaving(true);
        try {
            const ret = await updateMoneyBatch(bookId, materializeEvents(batch));
            setBatch(ret.batch);
            message.success("草稿已保存");
            return ret.batch;
        } catch {
            message.error("保存失败");
            return null;
        } finally {
            setSaving(false);
        }
    };

    const compute = async () => {
        const saved = await save();
        if (!saved) {
            return;
        }
        try {
            const ret = await computeMoneyBatch(bookId, saved.id);
            setBatch(ret.batch);
            message.success("计算完成");
        } catch {
            message.error("计算失败");
        }
    };

    const confirm = async () => {
        const saved = await save();
        if (!saved) {
            return;
        }
        try {
            const ret = await confirmMoneyBatch(bookId, saved.id);
            setBatch(ret.batch);
            message.success("批次已确认");
        } catch {
            message.error("确认失败");
        }
    };

    const columns: ColumnsType<ReconciliationEntry> = [
        {title: "项目", dataIndex: "itemNameSnapshot", fixed: "left", width: 130},
        {title: "类型", dataIndex: "itemTypeSnapshot", width: 120, render: (value) => itemTypeLabel(value)},
        {
            title: "上期值",
            dataIndex: "previousValueCents",
            width: 130,
            render: (value) => <div className="money-amount">{formatMoney(value)}</div>,
        },
        {
            title: "账面值",
            dataIndex: "bookValueCents",
            width: 140,
            render: (value, _record, index) => readonly ? <div className="money-amount">{formatMoney(value)}</div> : entryAmountInput(value, (next) => patchEntry(index, {bookValueCents: next})),
        },
        {
            title: "实际值",
            dataIndex: "actualValueCents",
            width: 140,
            render: (value, _record, index) => readonly ? <div className="money-amount">{formatMoney(value)}</div> : entryAmountInput(value, (next) => patchEntry(index, {actualValueCents: next})),
        },
        {
            title: "当期值",
            dataIndex: "currentValueCents",
            width: 140,
            render: (value, _record, index) => readonly ? <div className="money-amount">{formatMoney(value)}</div> : entryAmountInput(value, (next) => patchEntry(index, {currentValueCents: next})),
        },
        {
            title: "变化",
            dataIndex: "changeCents",
            width: 120,
            render: (value) => <div className="money-amount">{formatMoney(value)}</div>,
        },
        {
            title: "年化",
            dataIndex: "annualizedRate",
            width: 100,
            render: (value) => formatRate(value),
        },
    ];

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader
            title="对账批次"
            desc={batch ? `${batch.date} · ${batch.status === "confirmed" ? "已确认" : "草稿"}` : ""}
            extra={<>
                <Button onClick={() => navigate(`/money/${bookId}/history`)}>批次历史</Button>
                {!readonly ? <Button icon={<SaveOutlined/>} loading={saving} onClick={save}>保存草稿</Button> : null}
                {!readonly ? <Button onClick={compute}>重新计算</Button> : null}
                {!readonly ? <Popconfirm title="确认后默认锁定，继续吗？" onConfirm={confirm}><Button type="primary" icon={<CheckCircleOutlined/>}>确认批次</Button></Popconfirm> : null}
            </>}
        />
        <Spin spinning={loading}>
            {!batch ? <div className="money-section"><Empty description="批次不存在"/></div> : <>
                <div className="money-section">
                    <div className="money-grid">
                        <label>
                            <div className="money-muted">日期</div>
                            <DatePicker
                                disabled={readonly}
                                value={batch.date ? dayjs(batch.date) : undefined}
                                onChange={(value) => setBatch({...batch, date: value?.format("YYYY-MM-DD") || batch.date})}
                            />
                        </label>
                        <label>
                            <div className="money-muted">间隔天数</div>
                            <InputNumber disabled={readonly} value={batch.intervalDays} min={1} onChange={(value) => setBatch({...batch, intervalDays: Number(value || 1)})}/>
                        </label>
                        <label>
                            <div className="money-muted">状态</div>
                            <StatusTag status={batch.status}/>
                        </label>
                    </div>
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>录入明细</h2></div>
                    <Table rowKey="itemId" columns={columns} dataSource={batch.entries || []} pagination={false} scroll={{x: 1020}}/>
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>平账建议</h2></div>
                    {batch.balanceSuggestions?.length ? <Table
                        rowKey="id"
                        dataSource={batch.balanceSuggestions}
                        pagination={false}
                        columns={[
                            {title: "类型", dataIndex: "type", width: 130},
                            {title: "来源", dataIndex: "fromItemName", width: 140},
                            {title: "目标", dataIndex: "toItemName", width: 140},
                            {title: "差额", dataIndex: "diffCents", width: 130, render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                            {title: "说明", dataIndex: "message"},
                        ]}
                    /> : <Empty description="暂无建议，保存并计算后显示"/>}
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>资产负债和投资计算</h2></div>
                    <SummaryGrid summary={batch.summary}/>
                    {batch.summary?.calculationWarningMessages?.length ? <Alert
                        style={{marginTop: 12}}
                        type="warning"
                        showIcon
                        message={batch.summary.calculationWarningMessages.join("；")}
                    /> : null}
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>大事记</h2></div>
                    <Input.TextArea disabled={readonly} rows={5} value={eventText} onChange={(e) => setEventText(e.target.value)} placeholder="每行一条大事记"/>
                </div>
            </>}
        </Spin>
    </MoneyShell>;
}

function SummaryGrid({summary}: { summary?: MoneySummary }) {
    return <div className="money-grid">
        <MoneyMetric label="现金" value={formatMoney(summary?.cashCents)}/>
        <MoneyMetric label="净资产" value={formatMoney(summary?.netAssetCents)}/>
        <MoneyMetric label="负债" value={formatMoney(summary?.liabilityCents)}/>
        <MoneyMetric label="总资产" value={formatMoney(summary?.totalAssetCents)}/>
        <MoneyMetric label="净资产变化" value={formatMoney(summary?.netAssetChangeCents)}/>
        <MoneyMetric label="投资盈利" value={formatMoney(summary?.investmentProfitCents)}/>
        <MoneyMetric label="净资产负债率" value={formatRate(summary?.netAssetLiabilityRate)}/>
        <MoneyMetric label="资产负债率" value={formatRate(summary?.assetLiabilityRate)}/>
    </div>;
}

function DashboardSummary({dashboard}: { dashboard: MoneyDashboard }) {
    const summary = dashboard.summary || {};
    return <div className="money-dashboard-summary">
        <div className="money-hero-metric">
            <div className="money-metric-label">当前净资产</div>
            <div className={`money-hero-value ${signedClass(summary.netAssetCents)}`}>{formatMoney(summary.netAssetCents)}</div>
            <div className="money-hero-sub">
                <span>较上期 <strong className={signedClass(summary.netAssetChangeCents)}>{formatMoney(summary.netAssetChangeCents)}</strong></span>
                <span>最新批次 {dashboard.latestDate || "暂无"}</span>
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
    const [items, setItems] = useState<MoneyBatchIndexItem[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const ret = await listMoneyBatches(bookId);
            setItems(ret.items || []);
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

    const createDraft = async (copyFromBatchId?: string) => {
        try {
            const ret = await createMoneyBatch({bookId, date: dayjs().format("YYYY-MM-DD"), copyFromBatchId});
            navigate(`/money/${bookId}/reconcile/${ret.batch.id}`);
        } catch {
            message.error("创建草稿失败");
        }
    };

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader
            title="历史批次"
            extra={<>
                <Button onClick={() => navigate("/money")}>返回列表</Button>
                <Button type="primary" icon={<PlusOutlined/>} onClick={() => createDraft()}>新建草稿</Button>
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
                    {title: "净资产", dataIndex: "netAssetCents", render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                    {title: "净资产变化", dataIndex: "netAssetChangeCents", render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                    {title: "投资盈利", dataIndex: "investmentProfitCents", render: (value) => <div className="money-amount">{formatMoney(value)}</div>},
                    {title: "资产负债率", dataIndex: "assetLiabilityRate", render: (value) => formatRate(value)},
                    {title: "来源", dataIndex: "source", width: 120},
                    {
                        title: "操作",
                        width: 190,
                        render: (_, record) => <Space>
                            <Button size="small" onClick={() => navigate(`/money/${bookId}/reconcile/${record.id}`)}>查看详情</Button>
                            {record.status === "confirmed" ? <Button size="small" icon={<CopyOutlined/>} onClick={() => createDraft(record.id)}>复制草稿</Button> : null}
                        </Space>,
                    },
                ]}
            />
            <div className="money-history-cards">
                {items.map((record) => <div className="money-history-card" key={record.id}>
                    <div className="money-history-card-head">
                        <strong>{record.date}</strong>
                        <StatusTag status={record.status}/>
                    </div>
                    <div className="money-history-card-grid">
                        <span>净资产</span><strong className={signedClass(record.netAssetCents)}>{formatMoney(record.netAssetCents)}</strong>
                        <span>净资产变化</span><strong className={signedClass(record.netAssetChangeCents)}>{formatMoney(record.netAssetChangeCents)}</strong>
                        <span>投资盈利</span><strong>{formatMoney(record.investmentProfitCents)}</strong>
                        <span>资产负债率</span><strong>{formatRate(record.assetLiabilityRate)}</strong>
                    </div>
                    <div className="money-toolbar">
                        <Button size="small" onClick={() => navigate(`/money/${bookId}/reconcile/${record.id}`)}>查看详情</Button>
                        {record.status === "confirmed" ? <Button size="small" icon={<CopyOutlined/>} onClick={() => createDraft(record.id)}>复制草稿</Button> : null}
                    </div>
                </div>)}
            </div>
        </div>
    </MoneyShell>;
}

function StructureBars({items}: { items: { name: string, valueCents: number }[] }) {
    const max = Math.max(...items.map((item) => Math.abs(item.valueCents)), 1);
    if (!items.length) {
        return <Empty description="暂无结构数据"/>;
    }
    return <div className="money-bars">
        {items.map((item) => <div className="money-bar-row" key={item.name}>
            <div>{item.name}</div>
            <div className="money-bar-track"><div className="money-bar-fill" style={{width: `${Math.max(3, Math.abs(item.valueCents) / max * 100)}%`}}/></div>
            <div className="money-amount">{formatMoney(item.valueCents)}</div>
        </div>)}
    </div>;
}

function TrendBars({dashboard}: { dashboard: MoneyDashboard }) {
    const values = dashboard.trends || [];
    const max = Math.max(...values.map((item) => Math.abs(item.netAssetCents)), 1);
    if (!values.length) {
        return <Empty description="暂无趋势数据"/>;
    }
    return <div>
        <div className="money-timeline">
            {values.map((item) => <div className="money-trend-bar" key={item.date} title={`${item.date} ${formatMoney(item.netAssetCents)}`}>
                <div className={`money-trend-fill ${signedClass(item.netAssetCents)}`} style={{height: `${Math.max(6, Math.abs(item.netAssetCents) / max * 150)}px`}}/>
                <div className="money-trend-label">{item.date.slice(5)}</div>
            </div>)}
        </div>
        <div className="money-trend-list">
            {values.slice(-6).reverse().map((item) => <div className="money-trend-list-row" key={item.date}>
                <span>{item.date}</span>
                <strong className={signedClass(item.netAssetCents)}>{formatMoney(item.netAssetCents)}</strong>
            </div>)}
        </div>
    </div>;
}

function DashboardEvents({dashboard}: { dashboard: MoneyDashboard }) {
    const events = dashboard.events || [];
    if (!events.length) {
        return <Empty description="暂无大事记"/>;
    }
    return <div className="money-event-list">
        {events.map((event) => <div className="money-event-item" key={event.id || `${event.date}-${event.content}`}>
            <div className="money-event-date">{event.date}</div>
            <div className="money-event-content">{event.content}</div>
        </div>)}
    </div>;
}

export function MoneyDashboardPage() {
    const gate = useRequireLogin();
    const navigate = useNavigate();
    const {bookId = ""} = useParams();
    const [dashboard, setDashboard] = useState<MoneyDashboard | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setDashboard(await getMoneyDashboard(bookId));
        } catch {
            message.error("看板加载失败");
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        if (gate.isLoggedIn && bookId) {
            load();
        }
    }, [bookId, gate.isLoggedIn, load]);

    return <MoneyShell>
        {gate.loginPanel}
        <PageHeader title={dashboard?.book?.name || "家庭账本看板"} desc={dashboard?.latestDate ? `最新确认批次：${dashboard.latestDate}` : "暂无确认批次"} extra={<Button onClick={() => navigate("/money")}>返回列表</Button>}/>
        <Spin spinning={loading}>
            {!dashboard ? <div className="money-section"><Empty description="暂无看板数据"/></div> : <>
                <DashboardSummary dashboard={dashboard}/>
                <div className="money-section money-dashboard-panel">
                    <Tabs
                        items={[
                            {key: "trend", label: "历史趋势", children: <TrendBars dashboard={dashboard}/>},
                            {key: "asset", label: "资产结构", children: <StructureBars items={dashboard.assetStructure || []}/>},
                            {key: "liability", label: "负债结构", children: <StructureBars items={dashboard.liabilityStructure || []}/>},
                        ]}
                    />
                </div>
                <div className="money-section">
                    <div className="money-section-title"><h2>大事记</h2></div>
                    <DashboardEvents dashboard={dashboard}/>
                </div>
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
            message.success(`创建 ${ret.created.length} 个批次，跳过 ${ret.skippedSheets.length} 个 sheet`);
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
            desc="先预览识别结果，再确认写入历史批次"
            extra={<Button onClick={() => navigate(`/money/${bookId}/history`)}>批次历史</Button>}
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
