import {useCallback, useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Button, Popconfirm, Space, Table, message} from "antd";
import dayjs from "dayjs";
import {CopyOutlined, PlusOutlined} from "@ant-design/icons";
import {createMoneyRecord, deleteMoneyRecord, formatMoney, formatRate, getMoneyRecord, listMoneyRecords, listMoneyItems} from "./moneyApi";
import {MoneyRecordIndexItem, MoneySummary, ReconciliationRecord} from "./types";
import {MoneyShell, PageHeader, StatusTag} from "./components";
import {signedClass} from "./utils";
import {sortRecordsAsc, summarizeRecord} from "./summary";

function sourceLabel(source: string) {
    const labels: Record<string, string> = {
        manual: "手动录入",
        mannual: "手动录入",
        excel_import: "Excel 导入",
    };
    return labels[source] || source || "未知";
}

export function MoneyHistoryPage() {
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
        if (bookId) {
            load();
        }
    }, [bookId, load]);

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
