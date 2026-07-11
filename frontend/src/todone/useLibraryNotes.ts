import {useCallback, useEffect, useRef, useState} from 'react';
import {LibraryNote} from './net/protocal';
import {
    LibraryTaskScope,
    sendChangeLibraryNote,
    sendCreateLibraryNote,
    sendDelLibraryNote,
    sendGetLibraryNotes,
} from './net/send_back';

export interface LibraryNoteContext extends Omit<LibraryTaskScope, 'TaskID'> {
    UserID: string;
}

export function useLibraryNotes(visible: boolean, context: LibraryNoteContext | null, taskID: number | null) {
    const [notes, setNotes] = useState<LibraryNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const requestSeq = useRef(0);

    const buildScope = useCallback(() => {
        if (!context || !taskID) return null;
        return {...context, TaskID: taskID};
    }, [context, taskID]);

    const reload = useCallback(() => {
        const scope = buildScope();
        if (!visible || !scope) {
            setNotes([]);
            setLoading(false);
            setError(false);
            return;
        }
        const seq = ++requestSeq.current;
        setLoading(true);
        setError(false);
        sendGetLibraryNotes(scope, (ret) => {
            if (seq !== requestSeq.current) return;
            setLoading(false);
            if (!ret.ok) {
                setError(true);
                return;
            }
            setNotes(ret.data?.Notes || []);
        });
    }, [buildScope, visible]);

    useEffect(() => {
        reload();
        return () => {
            requestSeq.current += 1;
        };
    }, [reload]);

    const createNote = useCallback((roundID: string, content: string, eventTime: string): Promise<LibraryNote | null> => {
        const scope = buildScope();
        if (!scope) return Promise.resolve(null);
        return new Promise((resolve) => {
            sendCreateLibraryNote({
                ...scope,
                RoundID: roundID,
                Content: content,
                EventTime: eventTime,
                ClientRequestID: crypto.randomUUID(),
            }, (ret) => {
                if (!ret.ok || !ret.data?.Note) {
                    resolve(null);
                    return;
                }
                setNotes((prev) => [...prev, ret.data.Note].sort((a, b) => (
                    new Date(a.EventTime).getTime() - new Date(b.EventTime).getTime() || a.ID.localeCompare(b.ID)
                )));
                resolve(ret.data.Note);
            });
        });
    }, [buildScope]);

    const updateNote = useCallback((note: LibraryNote, content: string, eventTime: string): Promise<LibraryNote | null> => {
        const scope = buildScope();
        if (!scope) return Promise.resolve(null);
        return new Promise((resolve) => {
            sendChangeLibraryNote({
                ...scope,
                NoteID: note.ID,
                Revision: note.Revision,
                Content: content,
                EventTime: eventTime,
            }, (ret) => {
                if (!ret.ok || !ret.data?.Note) {
                    resolve(null);
                    return;
                }
                setNotes((prev) => prev.map((value) => value.ID === note.ID ? ret.data.Note : value));
                resolve(ret.data.Note);
            });
        });
    }, [buildScope]);

    const deleteNote = useCallback((note: LibraryNote): Promise<boolean> => {
        const scope = buildScope();
        if (!scope) return Promise.resolve(false);
        return new Promise((resolve) => {
            sendDelLibraryNote({...scope, NoteID: note.ID, Revision: note.Revision}, (ret) => {
                if (!ret.ok) {
                    resolve(false);
                    return;
                }
                setNotes((prev) => prev.filter((value) => value.ID !== note.ID));
                resolve(true);
            });
        });
    }, [buildScope]);

    return {notes, loading, error, reload, createNote, updateNote, deleteNote};
}
