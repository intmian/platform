import React, {useEffect, useMemo, useState} from "react";
import {Card, Col, Divider, Image, Row, Space, Typography} from "antd";
import TextRate from "./TextRate";
import {OutPutData, ScoreData} from "./OutPutData";
import {useIsMobile} from "../common/hooksv2";
import Paragraphs from "../common/Paragraphs";

const {Title, Text, Paragraph} = Typography;

// 各评分维度的文字序列
const SEQ_OBJ = ["垃圾", "低劣", "普通", "优秀", "传奇"];
const SEQ_SUBJ = ["折磨", "负面", "消磨", "享受", "极致"];
const SEQ_INNO = ["抄袭", "模仿", "沿袭", "创新", "革命"];
const SEQ_MAIN = ["零", "差", "合", "优", "满"];

// 将 ScoreData 转为 TextRate 需要的初始值（如 "普通+"）
function scoreDataToText(seq: string[], s: ScoreData): string {
    if (!s) return "";
    const index = Math.max(0, Math.min(seq.length - 1, s.value));
    const sign = s.plus ? "+" : s.sub ? "-" : "";
    return `${seq[index - 1]}${sign}`;
}

// 将 TextRate 返回的字符串解析为 ScoreData（保留原 comment）
function textToScoreData(seq: string[], text: string, old: ScoreData): ScoreData {
    const ret: ScoreData = {
        value: 0,
        plus: false,
        sub: false,
        comment: old?.comment || ""
    };
    if (!text) return ret;
    let sign: "" | "+" | "-" = "";
    if (text.endsWith("+")) sign = "+";
    else if (text.endsWith("-")) sign = "-";
    const label = sign ? text.slice(0, -1) : text;
    const idx = seq.findIndex((s) => s === label);
    ret.value = idx >= 0 ? idx + 1 : 0;
    ret.plus = sign === "+";
    ret.sub = sign === "-";
    return ret;
}

export interface OutPutCardProps {
    data: OutPutData;           // 输入数据
    editable?: boolean;         // 是否允许编辑评分
    onChange?: (next: OutPutData) => void; // 评分变更回调
}

const OutPutCard: React.FC<OutPutCardProps> = ({data, editable = true, onChange}) => {
    // 本地状态，保持受控简单清晰
    const [local, setLocal] = useState<OutPutData>(data);
    const mobile = useIsMobile()

    // 初始显示值（交给 TextRate）
    const initObj = useMemo(() => scoreDataToText(SEQ_OBJ, local.objScore), [local.objScore]);
    const initSubj = useMemo(() => scoreDataToText(SEQ_SUBJ, local.subScore), [local.subScore]);
    const initInno = useMemo(() => scoreDataToText(SEQ_INNO, local.innovateScore), [local.innovateScore]);
    const initMain = useMemo(() => scoreDataToText(SEQ_MAIN, local.mainScore), [local.mainScore]);

    // 更改标题为 name+mainScore
    useEffect(() => {
        document.title = `《${data.name}》鉴赏 - ${data.mainScore.value >= 0 ? data.mainScore.value + (data.mainScore.plus ? "+" : data.mainScore.sub ? "-" : "") : ""}/5分`;
    }, [data.name, data.mainScore]);

    // 更新工具：更新某个评分字段并上抛
    const updateScore = (key: keyof Pick<OutPutData, "objScore" | "score" | "innovateScore" | "mainScore">,
                         seq: string[],
                         text: string) => {
        const next: OutPutData = {...local};
        const old = next[key];
        next[key] = textToScoreData(seq, text, old);
        setLocal(next);
        onChange?.(next);
    };

    // 小卡片（第二、三、四栏）渲染函数，避免重复布局
    const fontSizeSub1 = mobile ? 15 : 20
    const fontSizeSub2 = mobile ? 10 : 16
    
    const renderScoreCard = (
        titleLeft: string,
        seq: string[],
        initValue: string,
        comment: string,
        onRate: (text: string) => void
    ) => {
        return (
            <Card size="small" bordered style={{borderRadius: 8}}>
                {/* 顶部一行：左标题 + 右评分 */}
                <Row justify="space-between" align="middle">
                    <Col>
                        <Text strong>{titleLeft}</Text>
                    </Col>
                    <Col>
                        <TextRate
                            sequence={seq}
                            editable={editable}
                            initialValue={initValue}
                            onChange={onRate}
                            fontSize={fontSizeSub1}
                            fontSize2={fontSizeSub2}
                        />
                    </Col>
                </Row>
                {/* 下方换行文本：评分依据 */}
                <div style={{marginTop: 8}}>
                    <Paragraphs>{comment}</Paragraphs>
                </div>
            </Card>
        );
    };

    const fontSizeMain1 = mobile ? 20 : 26
    const fontSizeMain2 = mobile ? 16 : 22

    return (
        <Card bordered style={{
            margin: 10,
            marginBottom: '16px',
            borderRadius: '10px',               /* 圆角 */
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)', /* 阴影效果 */
            backgroundColor: '#fff',           /* 背景色 */
        }}>
            <Row>
                <Space direction="vertical" size={4}>
                    <Title level={mobile ? 2 : 2} style={{margin: 0}}>
                        {local.name}
                    </Title>
                </Space>
            </Row>
            <Row>
                <Text type="secondary">
                    {local.note}
                </Text>
            </Row>
            <Space direction="vertical" size={16} style={{width: "100%"}}>
                <Row>
                    <div
                        style={{
                            width: "100%",
                            overflow: "hidden",
                            borderRadius: 6,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Image
                            placeholder
                            src={local.mainPic}
                            alt={local.name}
                            preview={true}
                            style={{
                                display: "block",
                                maxWidth: "100%",    // 超出容器宽度时缩小以适应
                                maxHeight: 360,      // 可根据需要调整最大高度
                                width: "auto",       // 小图不放大，保持原始宽度
                                height: "auto",
                                objectFit: "contain" // 保持完整图片，不裁切
                            }}
                        />
                    </div>
                </Row>


                <Row align="middle" justify="space-between">
                    <Col>
                        <Text strong>总分</Text>
                    </Col>
                    <Col>
                        <TextRate
                            sequence={SEQ_MAIN}
                            editable={editable}
                            initialValue={initMain}
                            onChange={(t) => updateScore("mainScore", SEQ_MAIN, t)}
                            fontSize={fontSizeMain1}
                            fontSize2={fontSizeMain2}
                        />
                    </Col>
                </Row>

                {/* 第二栏：客观评分（同类对比） */}
                {renderScoreCard(
                    "客观好坏",
                    SEQ_OBJ,
                    initObj,
                    local.objScore?.comment || "",
                    (t) => updateScore("objScore", SEQ_OBJ, t)
                )}

                {/* 第三栏：主观感受 */}
                {renderScoreCard(
                    "主观感受",
                    SEQ_SUBJ,
                    initSubj,
                    local.subScore?.comment || "",
                    (t) => updateScore("score", SEQ_SUBJ, t)
                )}

                {/* 第四栏：创新 */}
                {renderScoreCard(
                    "艺术创新",
                    SEQ_INNO,
                    initInno,
                    local.innovateScore?.comment || "",
                    (t) => updateScore("innovateScore", SEQ_INNO, t)
                )}

                {/* 第五栏：总分（非卡片） */}
                <Divider style={{margin: "8px 0"}}/>

                {/* 第六栏：总评价（字体小一点） */}
                <div>
                    <Paragraphs type="secondary" style={{fontSize: 12}}>
                        {local.comment}
                    </Paragraphs>
                </div>
            </Space>
        </Card>
    );
};

export default OutPutCard;

