import React, {useMemo} from 'react';
import {Card, Col, Divider, Row, Space, Tag, Typography} from 'antd';
import {LibraryExtra, LibraryScoreData} from './net/protocal';
import TextRate from '../library/TextRate';
import Paragraphs from '../common/Paragraphs';
import {useIsMobile} from '../common/hooksv2';
import {getLibraryCoverDisplayUrl, getMainScore} from './libraryUtil';

const {Title, Text} = Typography;

// 各评分维度的文字序列
const SEQ_OBJ = ["垃圾", "低劣", "普通", "优秀", "传奇"];
const SEQ_SUBJ = ["折磨", "负面", "消磨", "享受", "极致"];
const SEQ_INNO = ["抄袭", "模仿", "沿袭", "创新", "革命"];
const SEQ_MAIN = ["零", "差", "合", "优", "满"];

// 将 ScoreData 转为 TextRate 需要的文本（如 "普通+"）
function scoreDataToText(seq: string[], s: LibraryScoreData | undefined): string {
    if (!s || s.value <= 0) return "";
    const index = Math.max(0, Math.min(seq.length - 1, s.value - 1));
    const sign = s.plus ? "+" : s.sub ? "-" : "";
    return `${seq[index]}${sign}`;
}

export interface LibraryShareCardProps {
    title: string;
    extra: LibraryExtra;
    editable?: boolean;
    onChange?: (extra: LibraryExtra) => void;
}

/**
 * 分享卡片组件
 * 支持简单模式（仅显示主评分）和复杂模式（多维度评分）
 */
const LibraryShareCard: React.FC<LibraryShareCardProps> = ({title, extra, editable = false, onChange}) => {
    const isMobile = useIsMobile();
    const isComplexMode = extra.scoreMode === 'complex';
    const coverUrl = getLibraryCoverDisplayUrl(title, extra.pictureAddress);
    
    // 从日志中获取简单模式的主评分
    const simpleMainScore = useMemo(() => {
        if (isComplexMode) return null;
        return getMainScore(extra);
    }, [extra, isComplexMode]);

    // 简单模式下的 TextRate 初始值
    const simpleScoreText = useMemo(() => {
        if (!simpleMainScore) return "";
        const index = Math.max(0, Math.min(4, (simpleMainScore.score || 1) - 1));
        const sign = simpleMainScore.scorePlus ? "+" : simpleMainScore.scoreSub ? "-" : "";
        return `${SEQ_MAIN[index]}${sign}`;
    }, [simpleMainScore]);

    // 复杂模式下的各评分文本
    const objText = useMemo(() => scoreDataToText(SEQ_OBJ, extra.objScore), [extra.objScore]);
    const subText = useMemo(() => scoreDataToText(SEQ_SUBJ, extra.subScore), [extra.subScore]);
    const innoText = useMemo(() => scoreDataToText(SEQ_INNO, extra.innovateScore), [extra.innovateScore]);
    const mainText = useMemo(() => scoreDataToText(SEQ_MAIN, extra.mainScore), [extra.mainScore]);

    // 解析 TextRate 返回的字符串为 ScoreData
    const parseScoreText = (seq: string[], text: string, oldScore?: LibraryScoreData): LibraryScoreData => {
        const result: LibraryScoreData = {
            value: 0,
            plus: false,
            sub: false,
            comment: oldScore?.comment || ""
        };
        if (!text) return result;
        
        let sign: "" | "+" | "-" = "";
        if (text.endsWith("+")) sign = "+";
        else if (text.endsWith("-")) sign = "-";
        
        const label = sign ? text.slice(0, -1) : text;
        const idx = seq.findIndex(s => s === label);
        
        result.value = idx >= 0 ? idx + 1 : 0;
        result.plus = sign === "+";
        result.sub = sign === "-";
        return result;
    };

    // 更新评分
    const handleScoreChange = (
        key: 'objScore' | 'subScore' | 'innovateScore' | 'mainScore',
        seq: string[],
        text: string
    ) => {
        if (!onChange) return;
        const newExtra = {...extra};
        newExtra[key] = parseScoreText(seq, text, extra[key]);
        onChange(newExtra);
    };

    // 简单模式下的评分变更（更新日志中的主评分）
    const handleSimpleScoreChange = (text: string) => {
        if (!onChange) return;
        const parsed = parseScoreText(SEQ_MAIN, text, undefined);
        // 这里需要配合外部逻辑更新日志中的主评分
        // 暂时通过 mainScore 字段存储
        const newExtra = {...extra};
        newExtra.mainScore = parsed;
        onChange(newExtra);
    };

    const fontSizeSub1 = isMobile ? 15 : 19;
    const fontSizeSub2 = isMobile ? 10 : 15;
    const fontSizeMain1 = isMobile ? 22 : 30;
    const fontSizeMain2 = isMobile ? 16 : 20;

    // 小卡片渲染函数（复杂模式用）
    const renderScoreCard = (
        titleLeft: string,
        seq: string[],
        initValue: string,
        comment: string,
        scoreKey: 'objScore' | 'subScore' | 'innovateScore'
    ) => {
        return (
            <Card size="small" bordered style={{borderRadius: 8}}>
                <Row justify="space-between" align="middle">
                    <Col>
                        <Text strong>{titleLeft}</Text>
                    </Col>
                    <Col>
                        <TextRate
                            sequence={seq}
                            editable={editable}
                            initialValue={initValue}
                            onChange={(t) => handleScoreChange(scoreKey, seq, t)}
                            fontSize={fontSizeSub1}
                            fontSize2={fontSizeSub2}
                        />
                    </Col>
                </Row>
                <div style={{marginTop: 8}}>
                    <Paragraphs>{comment}</Paragraphs>
                </div>
            </Card>
        );
    };

    return (
        <Card 
            bordered 
            style={{
                margin: 10,
                marginBottom: 16,
                borderRadius: 10,
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
                backgroundColor: '#fff',
            }}
        >
            <Row justify="space-between" align="top" style={{marginBottom: 8}}>
                <Col flex="auto" style={{minWidth: 0, paddingRight: 16}}>
                    <Space direction="vertical" size={4} style={{width: '100%'}}>
                        <Row align="middle" gutter={8}>
                            <Col flex="auto">
                                <Title level={isMobile ? 2 : 1} style={{margin: 0, fontSize: isMobile ? 40 : 48, lineHeight: 1.05}}>
                                    {title}
                                </Title>
                            </Col>
                            {extra.category ? (
                                <Col>
                                    <Tag>{extra.category}</Tag>
                                </Col>
                            ) : null}
                        </Row>
                        <Space wrap size={[6, 6]}>
                            {extra.year ? <Text type="secondary">{extra.year}</Text> : null}
                            {extra.author && <Text type="secondary">{extra.author}</Text>}
                        </Space>
                        {extra.remark ? (
                            <Text type="secondary" style={{fontSize: 12}}>{extra.remark}</Text>
                        ) : null}
                    </Space>
                </Col>

                <Col flex="110px">
                    <div
                        style={{
                            width: isMobile ? 88 : 108,
                            aspectRatio: '2 / 3',
                            marginLeft: 'auto',
                            borderRadius: 8,
                            border: '1px solid #d9d9d9',
                            overflow: 'hidden',
                            background: '#f5f5f5',
                        }}
                    >
                        {coverUrl ? (
                            <img
                                src={coverUrl}
                                alt={title}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    objectPosition: 'center',
                                }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                        ) : null}
                    </div>
                </Col>
            </Row>

            <Space direction="vertical" size={10} style={{width: "100%"}}>
                <Divider style={{margin: '2px 0 6px 0'}}/>
                {/* 主评分 */}
                <Row align="middle" justify="space-between">
                    <Col>
                        <Text strong>总分</Text>
                    </Col>
                    <Col>
                        {isComplexMode ? (
                            <TextRate
                                sequence={SEQ_MAIN}
                                editable={editable}
                                initialValue={mainText}
                                onChange={(t) => handleScoreChange('mainScore', SEQ_MAIN, t)}
                                fontSize={fontSizeMain1}
                                fontSize2={fontSizeMain2}
                            />
                        ) : (
                            <TextRate
                                sequence={SEQ_MAIN}
                                editable={editable}
                                initialValue={simpleScoreText}
                                onChange={handleSimpleScoreChange}
                                fontSize={fontSizeMain1}
                                fontSize2={fontSizeMain2}
                            />
                        )}
                    </Col>
                </Row>

                {/* 复杂模式下的多维度评分 */}
                {isComplexMode && (
                    <>
                        {renderScoreCard(
                            "客观好坏",
                            SEQ_OBJ,
                            objText,
                            extra.objScore?.comment || "",
                            'objScore'
                        )}
                        {renderScoreCard(
                            "主观感受",
                            SEQ_SUBJ,
                            subText,
                            extra.subScore?.comment || "",
                            'subScore'
                        )}
                        {renderScoreCard(
                            "艺术创新",
                            SEQ_INNO,
                            innoText,
                            extra.innovateScore?.comment || "",
                            'innovateScore'
                        )}
                    </>
                )}

                {/* 总评 */}
                {extra.comment && (
                    <>
                        <Divider style={{margin: "8px 0"}}/>
                        <div>
                            <Paragraphs type="secondary" style={{fontSize: 12}}>
                                {extra.comment}
                            </Paragraphs>
                        </div>
                    </>
                )}
            </Space>
        </Card>
    );
};

export default LibraryShareCard;
