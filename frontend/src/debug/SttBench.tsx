import {useEffect, useRef, useState} from "react";
import {Button, Checkbox, Tag, message} from "antd";
import {AudioOutlined, StopOutlined} from "@ant-design/icons";
import {PageCard, PageHeader} from "../common/PageHeader";
import {request} from "../common/api";
import {concatPcm, pcmToWav, RealtimeTask} from "../common/realtimeTask";
import "./sttBench.css";

// 转写对比（试验场里的一页，只在本地开发出现）：录一段话，同时发给几个模型，并排看结果。
// 2026-11 用它比过一次：中文口语上阿里 qwen-audio 3.0/3.1 明显比 OpenAI 几个模型准、也快。
// 实时模型边录边推；“整段”模型在停止后把整段录音发过去。

interface BenchModel {
    key: string;
    vendor: "OpenAI" | "阿里";
    model: string;
    protocol: string;
    mode: "realtime" | "file";
    note: string;
}

const MODELS: BenchModel[] = [
    {key: "live", vendor: "OpenAI", model: "gpt-live-transcribe", protocol: "OpenAIRealtimeSTT", mode: "realtime", note: "线上主力"},
    {key: "rtw", vendor: "OpenAI", model: "gpt-realtime-whisper", protocol: "OpenAIRealtimeSTT", mode: "realtime", note: "边说边出"},
    {key: "gt", vendor: "OpenAI", model: "gpt-transcribe", protocol: "OpenAIRealtimeSTT", mode: "realtime", note: "说一句出一句（停顿后）"},
    {key: "gtfile", vendor: "OpenAI", model: "gpt-transcribe", protocol: "OpenAISTT", mode: "file", note: "说完后一次性出全文"},
    {key: "q31", vendor: "阿里", model: "qwen-audio-3.1-asr-flash-streaming", protocol: "DashScopeFunASRRealtime", mode: "realtime", note: ""},
    {key: "q31msg", vendor: "阿里", model: "qwen-audio-3.1-asr-flash-message", protocol: "DashScopeFunASRRealtime", mode: "realtime", note: "说一句出一句"},
    {key: "q30", vendor: "阿里", model: "qwen-audio-3.0-asr-flash-streaming", protocol: "DashScopeFunASRRealtime", mode: "realtime", note: "线上备用"},
    {key: "fun", vendor: "阿里", model: "fun-asr-realtime", protocol: "DashScopeFunASRRealtime", mode: "realtime", note: ""},
    {key: "funfile", vendor: "阿里", model: "fun-asr-flash-2026-06-15", protocol: "DashScopeFunASR", mode: "file", note: "说完后一次性出全文"},
];

const VOICE_PEAK = 0.03;

interface Column {
    status: "idle" | "connecting" | "running" | "finishing" | "done" | "failed";
    finals: Map<number, string>;
    partial: string;
    error: string;
    connectMs: number | null;
    firstTextAt: number | null;
    doneAt: number | null;
    task: RealtimeTask | null;
    sent: number; // 已经推给这个模型的帧数
}

function newColumn(): Column {
    return {status: "idle", finals: new Map(), partial: "", error: "", connectMs: null, firstTextAt: null, doneAt: null, task: null, sent: 0};
}

function finalText(column: Column): string {
    return Array.from(column.finals.entries()).sort(([a], [b]) => a - b).map(([, text]) => text.trim()).join("");
}

function seconds(ms: number | null): string {
    return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

export default function SttBench() {
    const [selected, setSelected] = useState<string[]>(MODELS.map((m) => m.key));
    const [recording, setRecording] = useState(false);
    const [, setTick] = useState(0);
    const rerender = () => setTick((n) => n + 1);

    const columnsRef = useRef<Record<string, Column>>({});
    const chunksRef = useRef<ArrayBuffer[]>([]);
    const timesRef = useRef<{start: number; voiceAt: number | null; stopAt: number | null}>({start: 0, voiceAt: null, stopAt: null});
    const audioRef = useRef<{stream: MediaStream; context: AudioContext; worklet: AudioWorkletNode} | null>(null);

    useEffect(() => () => {
        stopAudio();
        Object.values(columnsRef.current).forEach((c) => c.task?.cancel());
    }, []);

    function stopAudio() {
        const audio = audioRef.current;
        audioRef.current = null;
        if (!audio) return;
        audio.worklet.port.onmessage = null;
        audio.stream.getTracks().forEach((t) => t.stop());
        void audio.context.close();
    }

    // 把还没推的帧推给已经连上的实时模型；停止后再补一个 finish
    function pump(key: string) {
        const column = columnsRef.current[key];
        const task = column?.task;
        if (!task || task.state !== "ready") return;
        while (column.sent < chunksRef.current.length) {
            task.send(chunksRef.current[column.sent]);
            column.sent++;
        }
        if (timesRef.current.stopAt !== null) {
            column.status = "finishing";
            task.finish();
        }
    }

    function startRealtime(model: BenchModel) {
        const column = columnsRef.current[model.key];
        column.status = "connecting";
        const connectStart = Date.now();
        const markText = () => {
            if (column.firstTextAt === null) column.firstTextAt = Date.now();
        };
        column.task = new RealtimeTask({
            onReady: () => {
                column.connectMs = Date.now() - connectStart;
                column.status = "running";
                pump(model.key);
                rerender();
            },
            onPartial: (text) => {
                markText();
                column.partial = text;
                rerender();
            },
            onFinal: (id, text) => {
                markText();
                column.finals.set(id, text);
                column.partial = "";
                rerender();
            },
            onCompleted: () => {
                column.doneAt = Date.now();
                column.partial = "";
                column.status = "done";
                rerender();
            },
            onFailure: (msg) => {
                column.error = msg;
                column.status = "failed";
                rerender();
            },
        }, {protocol: model.protocol, model: model.model});
    }

    async function runFile(model: BenchModel, wav: Blob) {
        const column = columnsRef.current[model.key];
        column.status = "finishing";
        rerender();
        const form = new FormData();
        form.append("file", wav, "bench.wav");
        form.append("protocol", model.protocol);
        form.append("model", model.model);
        const ret = await request<{text: string}>("/misc/ai/transcribe/bench", form);
        if (ret.ok && ret.data) {
            column.finals.set(0, ret.data.text);
            column.firstTextAt = column.doneAt = Date.now();
            column.status = "done";
        } else {
            column.error = ret.msg || "请求失败";
            column.status = "failed";
        }
        rerender();
    }

    async function start() {
        Object.values(columnsRef.current).forEach((c) => c.task?.cancel());
        columnsRef.current = {};
        chunksRef.current = [];
        const models = MODELS.filter((m) => selected.includes(m.key));
        models.forEach((m) => {
            columnsRef.current[m.key] = newColumn();
        });
        try {
            // 和线上语音输入完全一样的采集方式
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true},
            });
            const context = new AudioContext();
            await context.audioWorklet.addModule(new URL("../common/realtimePcmWorklet.js", import.meta.url));
            const worklet = new AudioWorkletNode(context, "platform-realtime-pcm", {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
            });
            context.createMediaStreamSource(stream).connect(worklet);
            worklet.connect(context.destination);
            audioRef.current = {stream, context, worklet};
            timesRef.current = {start: Date.now(), voiceAt: null, stopAt: null};
            worklet.port.onmessage = (event: MessageEvent) => {
                if (event.data?.type !== "audio") return;
                chunksRef.current.push(event.data.buffer as ArrayBuffer);
                if (timesRef.current.voiceAt === null && Number(event.data.peak) > VOICE_PEAK) {
                    timesRef.current.voiceAt = Date.now();
                }
                models.filter((m) => m.mode === "realtime").forEach((m) => pump(m.key));
            };
            models.filter((m) => m.mode === "realtime").forEach(startRealtime);
            setRecording(true);
        } catch (err) {
            stopAudio();
            message.error(`无法打开麦克风：${String(err)}`);
        }
    }

    function stop() {
        stopAudio();
        timesRef.current.stopAt = Date.now();
        setRecording(false);
        const models = MODELS.filter((m) => columnsRef.current[m.key]);
        models.filter((m) => m.mode === "realtime").forEach((m) => pump(m.key));
        const wav = pcmToWav(concatPcm(chunksRef.current));
        models.filter((m) => m.mode === "file").forEach((m) => void runFile(m, wav));
    }

    const times = timesRef.current;
    const hasRun = Object.keys(columnsRef.current).length > 0;

    return <>
        <PageHeader title="转写对比" meta="随便说一段话，同时发给几个模型，并排看结果"/>
        <PageCard>
            <div className="stt-bench-setup">
                <Checkbox.Group value={selected} onChange={(v) => setSelected(v as string[])} disabled={recording}
                                options={MODELS.map((m) => ({value: m.key, label: `${m.vendor} ${m.model}${m.mode === "file" ? "（整段）" : ""}`}))}/>
                <div>
                    {recording
                        ? <Button danger type="primary" size="large" icon={<StopOutlined/>} onClick={stop}>说完了</Button>
                        : <Button type="primary" size="large" icon={<AudioOutlined/>} onClick={() => void start()}
                                  disabled={selected.length === 0}>开始录音</Button>}
                    {recording && <span className="stt-bench-hint">正在录音，说完点“说完了”</span>}
                </div>
            </div>
        </PageCard>
        {hasRun && <div className="stt-bench-grid">
            {MODELS.filter((m) => columnsRef.current[m.key]).map((m) => {
                const column = columnsRef.current[m.key];
                const text = finalText(column);
                const firstMs = column.firstTextAt !== null && times.voiceAt !== null && m.mode === "realtime"
                    ? column.firstTextAt - times.voiceAt : null;
                const tailMs = column.doneAt !== null && times.stopAt !== null ? column.doneAt - times.stopAt : null;
                return <PageCard key={m.key} className="stt-bench-col" title={<span>
                    <Tag color={m.vendor === "OpenAI" ? "green" : "orange"}>{m.vendor}</Tag>{m.model}{m.mode === "file" && "（整段）"}
                </span>} extra={m.note && <span className="stt-bench-note">{m.note}</span>}>
                    <div className="stt-bench-text">
                        {Array.from(column.finals.entries()).sort(([a], [b]) => a - b).map(([id, t]) =>
                            <span key={id} className="stt-bench-sentence">{t}</span>)}
                        {column.partial && <span className="stt-bench-partial">{column.partial}</span>}
                        {!text && !column.partial && <span className="stt-bench-partial">
                            {column.status === "connecting" ? "连接中…" : column.status === "failed" ? "" : "等待…"}
                        </span>}
                    </div>
                    {column.error && <div className="stt-bench-error">{column.error}</div>}
                    <div className="stt-bench-metrics">
                        <span title="从你开口到第一个字出现">首字 <b>{seconds(firstMs)}</b></span>
                        <span title="从点“说完了”到全部定稿">收尾 <b>{seconds(tailMs)}</b></span>
                        <span title="被切成了几句">分句 <b>{column.finals.size}</b></span>
                    </div>
                </PageCard>;
            })}
        </div>}
    </>;
}
