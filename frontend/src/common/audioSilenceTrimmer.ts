const FRAME_DURATION_MS = 20;
const NOISE_PERCENTILE = 0.2;
const SIGNAL_PERCENTILE = 0.9;
const NOISE_MARGIN_DB = 10;
const MIN_THRESHOLD_DBFS = -60;
const DEFAULT_MIN_THRESHOLD_DBFS = -55;
const MAX_THRESHOLD_DBFS = -42;
const MIN_SIGNAL_DBFS = -58;
const SIGNAL_HEADROOM_DB = 6;
const MAX_BRIDGED_SILENCE_MS = 180;
const MIN_SEGMENT_VOICE_MS = 100;
const MIN_TOTAL_VOICE_MS = 160;
const PRE_ROLL_MS = 150;
const POST_ROLL_MS = 250;
const MAX_UNCOMPRESSED_SILENCE_MS = 800;

interface AudioLevelFrame {
    start: number;
    end: number;
    dbfs: number;
}

interface VoiceSegment {
    start: number;
    end: number;
    activeSamples: number;
}

export interface AudioSilenceTrimResult {
    samples: Float32Array;
    hasVoice: boolean;
    originalDurationMs: number;
    outputDurationMs: number;
}

function samplesForDuration(sampleRate: number, durationMs: number): number {
    return Math.max(1, Math.round(sampleRate * durationMs / 1000));
}

function percentile(values: number[], ratio: number): number {
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
    return sorted[index];
}

function calculateDbfs(samples: Float32Array, start: number, end: number): number {
    let sum = 0;
    let sumSquares = 0;
    const count = Math.max(1, end - start);
    for (let index = start; index < end; index += 1) {
        const sample = samples[index];
        sum += sample;
        sumSquares += sample * sample;
    }

    // Remove a possible DC offset before calculating the frame energy.
    const mean = sum / count;
    const rms = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
    return 20 * Math.log10(Math.max(rms, 1e-8));
}

function measureFrames(samples: Float32Array, sampleRate: number): AudioLevelFrame[] {
    const frameSize = samplesForDuration(sampleRate, FRAME_DURATION_MS);
    const frames: AudioLevelFrame[] = [];
    for (let start = 0; start < samples.length; start += frameSize) {
        const end = Math.min(samples.length, start + frameSize);
        frames.push({
            start,
            end,
            dbfs: calculateDbfs(samples, start, end),
        });
    }
    return frames;
}

function detectVoiceSegments(
    frames: AudioLevelFrame[],
    sampleRate: number,
    thresholdDbfs: number,
): VoiceSegment[] {
    const maxBridgeSamples = samplesForDuration(sampleRate, MAX_BRIDGED_SILENCE_MS);
    const minSegmentSamples = samplesForDuration(sampleRate, MIN_SEGMENT_VOICE_MS);
    const segments: VoiceSegment[] = [];
    let current: VoiceSegment | null = null;

    frames.forEach((frame) => {
        if (frame.dbfs < thresholdDbfs) {
            return;
        }

        if (!current || frame.start - current.end > maxBridgeSamples) {
            if (current && current.activeSamples >= minSegmentSamples) {
                segments.push(current);
            }
            current = {
                start: frame.start,
                end: frame.end,
                activeSamples: frame.end - frame.start,
            };
            return;
        }

        current.end = frame.end;
        current.activeSamples += frame.end - frame.start;
    });

    if (current && current.activeSamples >= minSegmentSamples) {
        segments.push(current);
    }
    return segments;
}

function copyRanges(samples: Float32Array, ranges: Array<[number, number]>): Float32Array {
    if (ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === samples.length) {
        return samples;
    }
    const totalLength = ranges.reduce((sum, [start, end]) => sum + end - start, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    ranges.forEach(([start, end]) => {
        const part = samples.subarray(start, end);
        result.set(part, offset);
        offset += part.length;
    });
    return result;
}

/**
 * Conservatively removes obvious low-volume PCM ranges. Short pauses are kept,
 * while long pauses are reduced to the pre/post roll around adjacent speech.
 */
export function trimSilentPcm(samples: Float32Array, sampleRate: number): AudioSilenceTrimResult {
    const originalDurationMs = sampleRate > 0 ? samples.length / sampleRate * 1000 : 0;
    const emptyResult = (): AudioSilenceTrimResult => ({
        samples: new Float32Array(),
        hasVoice: false,
        originalDurationMs,
        outputDurationMs: 0,
    });

    if (samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
        return emptyResult();
    }

    const frames = measureFrames(samples, sampleRate);
    const levels = frames.map((frame) => frame.dbfs);
    const signalLevel = percentile(levels, SIGNAL_PERCENTILE);
    if (signalLevel < MIN_SIGNAL_DBFS) {
        return emptyResult();
    }

    const noiseFloor = percentile(levels, NOISE_PERCENTILE);
    const noiseThreshold = Math.min(
        MAX_THRESHOLD_DBFS,
        Math.max(DEFAULT_MIN_THRESHOLD_DBFS, noiseFloor + NOISE_MARGIN_DB),
    );
    // Keep low but clearly varying speech by ensuring the loudest frames still
    // have some headroom over the gate.
    const thresholdDbfs = Math.max(
        MIN_THRESHOLD_DBFS,
        Math.min(noiseThreshold, signalLevel - SIGNAL_HEADROOM_DB),
    );
    const segments = detectVoiceSegments(frames, sampleRate, thresholdDbfs);
    const totalActiveSamples = segments.reduce((sum, segment) => sum + segment.activeSamples, 0);
    if (totalActiveSamples < samplesForDuration(sampleRate, MIN_TOTAL_VOICE_MS)) {
        return emptyResult();
    }

    const preRollSamples = samplesForDuration(sampleRate, PRE_ROLL_MS);
    const postRollSamples = samplesForDuration(sampleRate, POST_ROLL_MS);
    const maxUncompressedSilenceSamples = samplesForDuration(sampleRate, MAX_UNCOMPRESSED_SILENCE_MS);
    const ranges: Array<[number, number]> = [];
    let rangeStart = Math.max(0, segments[0].start - preRollSamples);
    let rangeEnd = Math.min(samples.length, segments[0].end + postRollSamples);
    let previousVoiceEnd = segments[0].end;

    for (let index = 1; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment.start - previousVoiceEnd <= maxUncompressedSilenceSamples) {
            rangeEnd = Math.min(samples.length, segment.end + postRollSamples);
        } else {
            ranges.push([rangeStart, rangeEnd]);
            rangeStart = Math.max(0, segment.start - preRollSamples);
            rangeEnd = Math.min(samples.length, segment.end + postRollSamples);
        }
        previousVoiceEnd = segment.end;
    }
    ranges.push([rangeStart, rangeEnd]);

    const trimmedSamples = copyRanges(samples, ranges);
    return {
        samples: trimmedSamples,
        hasVoice: true,
        originalDurationMs,
        outputDurationMs: trimmedSamples.length / sampleRate * 1000,
    };
}
