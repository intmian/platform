import React from 'react';
import {StarFilled} from '@ant-design/icons';
import {Divider, Space, Typography} from 'antd';
import {LibraryExtra, LibraryLogEntry, LibraryScoreData} from './net/protocal';
import {getComplexScoreSnapshot, getMainScore, getScoreDisplay, getScoreStarColor, getScoreText} from './libraryUtil';

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
    const mainScore = (mainScoreOverride as LibraryLogEntry | undefined) || getMainScore(extra);
    const scoreSnapshot = getComplexScoreSnapshot(extra, mainScore);
    const isComplex = scoreSnapshot.mode === 'complex';
    const mainScoreText = mainScore
        ? getScoreText(mainScore.score || 0, mainScore.scorePlus, mainScore.scoreSub)
        : '-';
    const mainScoreDisplay = mainScore
        ? getScoreDisplay(mainScore.score || 0, mainScore.scorePlus, mainScore.scoreSub)
        : '';
    const mainScoreComment = mainScore?.comment || '';
    // 兼容历史数据：旧版本会把复杂评分“总评”写在 extra.comment。
    const mergedMainComment = (mainScoreComment || extra.comment || '').trim();
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
                {mergedMainComment ? (
                    <div style={{marginTop: 2}}>
                        <Text type="secondary" style={{fontSize: 12}}>{mergedMainComment}</Text>
                    </div>
                ) : null}
            </div>

            {isComplex ? (
                <>
                    <Divider style={{margin: '8px 0'}} />
                    <Row label="客观好坏" value={scoreDataToText(SEQ_OBJ, scoreSnapshot.objScore)} comment={scoreSnapshot.objScore?.comment} />
                    <Row label="主观感受" value={scoreDataToText(SEQ_SUB, scoreSnapshot.subScore)} comment={scoreSnapshot.subScore?.comment} />
                    <Row label="艺术创新" value={scoreDataToText(SEQ_INNO, scoreSnapshot.innovateScore)} comment={scoreSnapshot.innovateScore?.comment} />
                </>
            ) : null}
        </div>
    );
}
