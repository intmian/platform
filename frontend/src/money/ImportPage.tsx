import {useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Alert, Button, Spin, Table, Tag, message} from "antd";
import {confirmMoneyExcelImport, formatMoney, previewMoneyExcelImport} from "./moneyApi";
import {MoneyImportPreview} from "./types";
import {MoneyShell, PageHeader} from "./components";
import {readFileAsDataURL} from "./utils";

export function MoneyImportPage() {
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
