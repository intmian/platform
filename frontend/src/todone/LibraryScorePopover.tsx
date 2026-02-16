import React from 'react';
import {StarFilled} from '@ant-design/icons';
import {Divider, Space, Typography} from 'antd';
import {LibraryExtra, LibraryScoreData} from './net/protocal';
import {getMainScore, getScoreDisplay, getScoreStarColor, getScoreText} from './libraryUtil';

const {Text} = Typography;

const SEQ_MAIN = ['零', '差', '合', '优', '满'];
const SEQ_OBJ = ['垃圾', '低劣', '普通', '优秀', '传奇'];
const SEQ_SUB = ['折磨', '负面', '消磨', '享受', '极致'];
const SEQ_INNO = ['抄袭', '模仿', '沿袭', '创新', '革命'];

function scoreDataToText(seq: string[], score?: LibraryScoreData): string {
    if (!score || score.value <= 0) return '-';
    const index = Math.max(0, Math.min(seq.length - 1, score.value - 1));
    const sign = score.plus ? '+' : score.sub ? '-' : '';
    return `${seq[index]}${sign}`;
}

function Row({label, value, comment}: {label: string; value: string; comment?: string}) {
    return (
        <div style={{marginBottom: 8}}>
            <Space size={6} wrap>
                <Text strong>{label}</Text>
                <Text>{value || '-'}</Text>
            </Space>
            {comment?.trim() ? (
                <div style={{marginTop: 2}}>
                    <Text type="secondary" style={{fontSize: 12}}>{comment.trim()}</Text>
                </div>
            ) : null}
        </div>
    );
}

interface LibraryScorePopoverProps {
    extra: LibraryExtra;
    mainScoreOverride?: {
        score?: number;
        scorePlus?: boolean;
        scoreSub?: boolean;
        comment?: string;
    };
}

export default function LibraryScorePopover({extra, mainScoreOverride}: LibraryScorePopoverProps) {
    const isComplex = extra.scoreMode === 'complex';
    const mainScore = mainScoreOverride || getMainScore(extra);
    const mainScoreText = mainScore
        ? getScoreText(mainScore.score || 0, mainScore.scorePlus, mainScore.scoreSub)
        : '-';
    const mainScoreDisplay = mainScore
        ? getScoreDisplay(mainScore.score || 0, mainScore.scorePlus, mainScore.scoreSub)
        : '';
    const mainScoreComment = mainScore?.comment || '';
    const mainScoreColor = getScoreStarColor(mainScore?.score || 0);

    return (
        <div style={{maxWidth: 320, minWidth: 260}}>
            <div style={{marginBottom: 8}}>
                <Space size={6} wrap>
                    <Text strong>主评分</Text>
                    {mainScore ? (
                        <>
                            <StarFilled style={{color: mainScoreColor}}/>
                            <Text>{mainScoreText}</Text>
                            <Text type="secondary">({mainScoreDisplay})</Text>
                        </>
                    ) : (
                        <Text type="secondary">-</Text>
                    )}
                </Space>
                {mainScoreComment.trim() ? (
                    <div style={{marginTop: 2}}>
                        <Text type="secondary" style={{fontSize: 12}}>{mainScoreComment.trim()}</Text>
                    </div>
                ) : null}
            </div>

            {isComplex ? (
                <>
                    <Divider style={{margin: '8px 0'}} />
                    <Row label="客观好坏" value={scoreDataToText(SEQ_OBJ, extra.objScore)} comment={extra.objScore?.comment} />
                    <Row label="主观感受" value={scoreDataToText(SEQ_SUB, extra.subScore)} comment={extra.subScore?.comment} />
                    <Row label="玩法创新" value={scoreDataToText(SEQ_INNO, extra.innovateScore)} comment={extra.innovateScore?.comment} />
                    {extra.comment?.trim() ? (
                        <>
                            <Divider style={{margin: '8px 0'}} />
                            <Row label="总评" value="" comment={extra.comment} />
                        </>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
