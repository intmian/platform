import React, {useMemo} from 'react';
import {Card, Col, Divider, Row, Space, Tag, Typography} from 'antd';
import {LibraryExtra, LibraryScoreData} from './net/protocal';
import TextRate from '../library/TextRate';
import Paragraphs from '../common/Paragraphs';
import {useIsMobile} from '../common/hooksv2';
import {getComplexScoreSnapshot, getLibraryCoverDisplayUrl, getMainScore} from './libraryUtil';

const {Title, Text} = Typography;

const SEQ_MAIN = ["零", "差", "合", "优", "满"];
const SEQ_OBJ = ["垃圾", "低劣", "普通", "优秀", "传奇"];
const SEQ_SUBJ = ["折磨", "负面", "消磨", "享受", "极致"];
const SEQ_INNO = ["抄袭", "模仿", "沿袭", "创新", "革命"];

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

const LibraryShareCard: React.FC<LibraryShareCardProps> = ({title, extra, editable = false, onChange}) => {
    const isMobile = useIsMobile();
    const coverUrl = getLibraryCoverDisplayUrl(title, extra.pictureAddress);

    // 复杂模式下也统一使用评分日志读取主评分，兼容历史快照字段。
    const complexMainScore = useMemo(() => {
        return getMainScore(extra);
    }, [extra]);
    const scoreSnapshot = useMemo(() => getComplexScoreSnapshot(extra, complexMainScore), [extra, complexMainScore]);
    const isComplexMode = scoreSnapshot.mode === 'complex';

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

    const mainText = useMemo(() => {
        const score = complexMainScore;
        if (!score) return "";
        const index = Math.max(0, Math.min(4, (score.score || 1) - 1));
        const sign = score.scorePlus ? "+" : score.scoreSub ? "-" : "";
        return `${SEQ_MAIN[index]}${sign}`;
    }, [complexMainScore]);
    const objText = useMemo(() => scoreDataToText(SEQ_OBJ, scoreSnapshot.objScore), [scoreSnapshot.objScore]);
    const subText = useMemo(() => scoreDataToText(SEQ_SUBJ, scoreSnapshot.subScore), [scoreSnapshot.subScore]);
    const innoText = useMemo(() => scoreDataToText(SEQ_INNO, scoreSnapshot.innovateScore), [scoreSnapshot.innovateScore]);
    const legacyOverallComment = (extra.comment || '').trim();

    const handleMainScoreChange = (text: string) => {
        if (!onChange) return;
        // 已废弃字段：主评分快照不再维护，仅保留日志数据源。
        void text;
    };

    const handleSubScoreChange = (
        key: 'objScore' | 'subScore' | 'innovateScore',
        seq: string[],
        text: string
    ) => {
        if (!onChange) return;
        // 已废弃字段：复杂评分维度不再写回 extra，仅由评分日志驱动。
        void key;
        void seq;
        void text;
    };

    const fontSizeMain1 = isMobile ? 20 : 24;
    const fontSizeMain2 = isMobile ? 14 : 16;
    const fontSizeSub1 = isMobile ? 15 : 18;
    const fontSizeSub2 = isMobile ? 10 : 14;

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
                            onChange={(t) => handleSubScoreChange(scoreKey, seq, t)}
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
            <Row
                justify="start"
                align="top"
                wrap={false}
                gutter={isMobile ? 12 : 16}
                style={{marginTop: 4}}
            >
                <Col flex="none">
                    <div
                        style={{
                            width: isMobile ? 86 : 108,
                            aspectRatio: '2 / 3',
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

                <Col flex="auto" style={{minWidth: 0}}>
                    <div
                        style={{
                            minHeight: isMobile ? 132 : 162,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            textAlign: 'right',
                        }}
                    >
                        <div
                            style={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'flex-end',
                                alignItems: 'flex-start',
                                gap: 8,
                            }}
                        >
                            {extra.category ? (
                                <Tag style={{marginInlineEnd: 0, marginTop: 2, flexShrink: 0}}>{extra.category}</Tag>
                            ) : null}
                            <Title
                                level={isMobile ? 3 : 2}
                                style={{
                                    margin: 0,
                                    fontSize: isMobile ? 30 : 40,
                                    lineHeight: 1.12,
                                    textAlign: 'right',
                                }}
                            >
                                {title}
                            </Title>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'flex-end', width: '100%'}}>
                            <TextRate
                                sequence={SEQ_MAIN}
                                editable={editable}
                                initialValue={isComplexMode ? mainText : simpleScoreText}
                                onChange={handleMainScoreChange}
                                fontSize={fontSizeMain1}
                                fontSize2={fontSizeMain2}
                            />
                        </div>
                    </div>
                </Col>
            </Row>

            {isComplexMode || legacyOverallComment ? (
                <Space direction="vertical" size={10} style={{width: '100%', marginTop: 10}}>
                    <Divider style={{margin: '2px 0 6px 0'}}/>

                    {isComplexMode ? (
                        <>
                            {renderScoreCard(
                                '客观好坏',
                                SEQ_OBJ,
                                objText,
                                scoreSnapshot.objScore?.comment || '',
                                'objScore'
                            )}
                            {renderScoreCard(
                                '主观感受',
                                SEQ_SUBJ,
                                subText,
                                scoreSnapshot.subScore?.comment || '',
                                'subScore'
                            )}
                            {renderScoreCard(
                                '艺术创新',
                                SEQ_INNO,
                                innoText,
                                scoreSnapshot.innovateScore?.comment || '',
                                'innovateScore'
                            )}
                        </>
                    ) : null}

                    {legacyOverallComment ? (
                        <div>
                            <Paragraphs type="secondary" style={{fontSize: 12}}>
                                {legacyOverallComment}
                            </Paragraphs>
                        </div>
                    ) : null}
                </Space>
            ) : null}
        </Card>
    );
};

export default LibraryShareCard;
