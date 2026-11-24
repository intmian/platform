import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Alert, AutoComplete, Button, Checkbox, Empty, Input, Modal, Select, Spin, Table, message} from "antd";
import type {ColumnsType} from "antd/es/table";
import {DeleteOutlined, PlusOutlined, SaveOutlined} from "@ant-design/icons";
import {grantMoneyDashboard, itemTypeLabel, listMoneyBooks, listMoneyItems, normalizeMoneyItemType, updateMoneyBook, updateMoneyItems, MONEY_ITEM_TYPES} from "./moneyApi";
import {MoneyBook, MoneyItem} from "./types";
import {MoneyShell, PageHeader, EditableStringList} from "./components";
import {orderedStrings} from "./utils";

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
            type: "现金账户",
            includeInReconcile: true,
            includeInCash: true,
            includeInNetAsset: true,
            note: "建议作为主平账账户",
        },
        {
            ...makeNewItem(bookId, 2),
            id: "cash-wechat",
            name: "微信",
            type: "现金账户",
            includeInReconcile: true,
            includeInCash: true,
            includeInNetAsset: true,
        },
        {
            ...makeNewItem(bookId, 3),
            id: "investment-fund",
            name: "基金",
            type: "投资",
            includeInInvestmentProfit: true,
            includeInNetAsset: true,
        },
        {
            ...makeNewItem(bookId, 4),
            id: "liability-loan",
            name: "贷款",
            type: "负债",
            includeInNetAsset: false,
            includeInLiability: true,
        },
    ];
}

export function MoneyConfigPage() {
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
            const nextItems = (itemRet.items || []).map((item) => ({
                ...item,
                type: normalizeMoneyItemType(item.type),
            }));
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
        if (bookId) {
            load();
        }
    }, [bookId, load]);

    const patchItem = (index: number, patch: Partial<MoneyItem>) => {
        setItems((prev) => prev.map((item, idx) => idx === index ? {...item, ...patch} : item));
    };

    const typeOptions = useMemo(() => orderedStrings([
        ...MONEY_ITEM_TYPES,
        ...items.map((item) => normalizeMoneyItemType(item.type)),
    ]).map((value) => ({value})), [items]);

    const typeInput = (record: MoneyItem, index: number) => <AutoComplete
        style={{width: "100%"}}
        value={record.type}
        options={typeOptions}
        placeholder="请选择或输入类型"
        filterOption={(inputValue, option) => String(option?.value || "").includes(inputValue)}
        onChange={(value) => patchItem(index, {type: value})}
    />;

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
            render: (_, record, index) => typeInput(record, index),
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
                                {typeInput(item, index)}
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
