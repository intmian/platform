const TARGET_SAMPLE_RATE = 8000;
const FRAME_SAMPLE_COUNT = 800;
const WAVEFORM_BAR_COUNT = 16;

class RealtimePcm8kProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sourceBuffer = new Float32Array(0);
        this.sourcePosition = 0;
        this.pendingSamples = [];
        this.port.onmessage = (event) => {
            if (event.data?.type === "flush") {
                this.flushPendingSamples();
                this.port.postMessage({type: "flushed"});
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0]?.[0];
        if (output) {
            output.fill(0);
        }
        const input = inputs[0]?.[0];
        if (!input?.length) {
            return true;
        }

        const combined = new Float32Array(this.sourceBuffer.length + input.length);
        combined.set(this.sourceBuffer);
        combined.set(input, this.sourceBuffer.length);

        const ratio = sampleRate / TARGET_SAMPLE_RATE;
        let position = this.sourcePosition;
        while (position + 1 < combined.length) {
            const leftIndex = Math.floor(position);
            const fraction = position - leftIndex;
            const sample = combined[leftIndex]
                + (combined[leftIndex + 1] - combined[leftIndex]) * fraction;
            this.pendingSamples.push(sample);
            position += ratio;
        }

        const consumed = Math.min(Math.floor(position), Math.max(0, combined.length - 1));
        this.sourceBuffer = combined.slice(consumed);
        this.sourcePosition = position - consumed;

        while (this.pendingSamples.length >= FRAME_SAMPLE_COUNT) {
            this.emitSamples(this.pendingSamples.splice(0, FRAME_SAMPLE_COUNT));
        }
        return true;
    }

    flushPendingSamples() {
        if (this.pendingSamples.length > 0) {
            this.emitSamples(this.pendingSamples.splice(0));
        }
    }

    emitSamples(samples) {
        const buffer = new ArrayBuffer(samples.length * 2);
        const view = new DataView(buffer);
        const waveform = new Array(WAVEFORM_BAR_COUNT).fill(0);
        let peak = 0;
        samples.forEach((value, index) => {
            const sample = Math.max(-1, Math.min(1, value));
            const level = Math.abs(sample);
            const waveformIndex = Math.min(
                WAVEFORM_BAR_COUNT - 1,
                Math.floor(index * WAVEFORM_BAR_COUNT / samples.length),
            );
            waveform[waveformIndex] = Math.max(waveform[waveformIndex], level);
            peak = Math.max(peak, level);
            const pcm = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
            view.setInt16(index * 2, pcm, true);
        });
        this.port.postMessage({type: "audio", buffer, peak, waveform}, [buffer]);
    }
}

registerProcessor("platform-realtime-pcm-8k", RealtimePcm8kProcessor);
