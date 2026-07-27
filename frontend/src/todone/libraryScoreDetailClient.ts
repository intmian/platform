import {LibraryScoreDetail} from './net/protocal';
import {
    LibraryScoreDetailInput,
    LibraryTaskScope,
    sendChangeLibraryScoreDetail,
    sendCreateLibraryScoreDetail,
    sendGetLibraryScoreDetail,
} from './net/send_back';

export interface LibraryScoreDetailContext extends Omit<LibraryTaskScope, 'TaskID'> {
    UserID: string;
}

export function getLibraryScoreDetail(
    context: LibraryScoreDetailContext,
    taskID: number,
    scoreID: string,
): Promise<LibraryScoreDetail | null> {
    return new Promise((resolve) => {
        sendGetLibraryScoreDetail({...context, TaskID: taskID, ScoreID: scoreID}, (ret) => {
            resolve(ret.ok && ret.data?.Detail ? ret.data.Detail : null);
        });
    });
}

export function createLibraryScoreDetail(
    context: LibraryScoreDetailContext,
    taskID: number,
    scoreID: string,
    roundID: string,
    detail: LibraryScoreDetailInput,
): Promise<LibraryScoreDetail | null> {
    return new Promise((resolve) => {
        sendCreateLibraryScoreDetail({
            ...context,
            TaskID: taskID,
            ScoreID: scoreID,
            RoundID: roundID,
            ClientRequestID: scoreID,
            Detail: detail,
        }, (ret) => {
            resolve(ret.ok && ret.data?.Detail ? ret.data.Detail : null);
        });
    });
}

export function changeLibraryScoreDetail(
    context: LibraryScoreDetailContext,
    taskID: number,
    scoreID: string,
    revision: number,
    detail: LibraryScoreDetailInput,
): Promise<LibraryScoreDetail | null> {
    return new Promise((resolve) => {
        sendChangeLibraryScoreDetail({
            ...context,
            TaskID: taskID,
            ScoreID: scoreID,
            Revision: revision,
            Detail: detail,
        }, (ret) => {
            resolve(ret.ok && ret.data?.Detail ? ret.data.Detail : null);
        });
    });
}
