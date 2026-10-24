import {createContext, useContext, useEffect, useRef, useState} from 'react';
import type {CSSProperties, PropsWithChildren} from 'react';
import {Input} from 'antd';
import {WhisperButton} from '../common/WhisperButton';

const VoiceContext = createContext({
    busy: false,
    setBusy: (_id: symbol, _busy: boolean) => {},
});

export function LibraryVoiceProvider({children}: PropsWithChildren) {
    const [owner, setOwner] = useState<symbol | null>(null);
    return <VoiceContext.Provider value={{
        busy: owner !== null,
        setBusy: (id, busy) => setOwner(current => busy ? id : current === id ? null : current),
    }}>{children}</VoiceContext.Provider>;
}

export function useLibraryVoiceBusy() {
    return useContext(VoiceContext).busy;
}

interface Props {
    value?: string;
    onChange?: (value: string) => void;
    active: boolean;
    disabled?: boolean;
    rows: number;
    placeholder?: string;
    label: string;
    style?: CSSProperties;
    id?: string;
}

function appendText(current: string, text: string) {
    const next = text.trim();
    return !next ? current : current + (current && !/\s$/.test(current) ? '\n' : '') + next;
}

// Unmount the session immediately on close, including while file transcription is pending.
export default function LibraryVoiceInput(props: Props) {
    return props.active ? <VoiceSession {...props}/> : null;
}

function VoiceSession({value = '', onChange, disabled, rows, placeholder, label, style, id}: Props) {
    const scope = useContext(VoiceContext);
    const owner = useRef(Symbol('voice-input'));
    const mounted = useRef(true);
    const currentValue = useRef(value);
    currentValue.current = value;
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState('');
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const displayedValue = appendText(value, preview);
    const inputProps = {
        id, value: displayedValue, placeholder, disabled,
        readOnly: busy,
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange?.(event.target.value),
    };
    return <div style={style}>
        <Input.TextArea {...inputProps} rows={rows}/>
        <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 4}}>
            <WhisperButton
                tooltip={`语音输入${label}`} disabled={disabled || (scope.busy && !busy)}
                showRealtimePreview={false}
                onBusyChange={next => {
                    scope.setBusy(owner.current, next);
                    if (mounted.current) {
                        setBusy(next);
                        if (!next) setPreview('');
                    }
                }}
                onPartialText={text => { if (mounted.current) setPreview(text); }}
                onText={text => {
                    if (!mounted.current) return;
                    setPreview('');
                    onChange?.(appendText(currentValue.current, text));
                }}
            />
        </div>
    </div>;
}
