import React from 'react';
import {StarFilled} from '@ant-design/icons';
import {Divider, Space, Typography} from 'antd';
import {LibraryLogEntry, LibraryScoreDetail, LibraryScoreDetailDimension} from './net/protocal';
import {getScoreDisplay, getScoreStarColor, getScoreText} from './libraryUtil';

const {Text} = Typography;

const SEQ_MAIN = ['零', '差', '合', '优', '满'];
const SEQ_OBJ = ['垃圾', '低劣', '普通', '优秀', '传奇'];
const SEQ_SUB = ['折磨', '负面', '消磨', '享受', '极致'];
const SEQ_INNO = ['抄袭', '模仿', '沿袭', '创新', '革命'];

function scoreDataToText(seq: string[], score?: LibraryScoreDetailDimension): string {
    if (!score || score.Value <= 0) return '-';
    const index = Math.max(0, Math.min(seq.length - 1, score.Value - 1));
    const sign = score.Adjustment > 0 ? '+' : score.Adjustment < 0 ? '-' : '';
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
    score: LibraryLogEntry;
    detail: LibraryScoreDetail;
}

export default function LibraryScorePopover({score, detail}: LibraryScorePopoverProps) {
    const isComplex = detail.Mode === 'complex';
    const mainScoreText = getScoreText(score.score || 0, score.scorePlus, score.scoreSub);
    const mainScoreDisplay = getScoreDisplay(score.score || 0, score.scorePlus, score.scoreSub);
    const mergedMainComment = detail.Comment.trim();
    const mainScoreColor = getScoreStarColor(score.score || 0);

    return (
        <div style={{maxWidth: 320, minWidth: 260}}>
            <div style={{marginBottom: 8}}>
                <Space size={6} wrap>
                    <Text strong>主评分</Text>
                    <StarFilled style={{color: mainScoreColor}}/>
                    <Text>{mainScoreText}</Text>
                    <Text type="secondary">({mainScoreDisplay})</Text>
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
                    <Row label="客观好坏" value={scoreDataToText(SEQ_OBJ, detail.ObjScore)} comment={detail.ObjScore?.Comment} />
                    <Row label="主观感受" value={scoreDataToText(SEQ_SUB, detail.SubScore)} comment={detail.SubScore?.Comment} />
                    <Row label="艺术创新" value={scoreDataToText(SEQ_INNO, detail.InnovateScore)} comment={detail.InnovateScore?.Comment} />
                </>
            ) : null}
        </div>
    );
}
