// Splits a 16 kHz mono PCM stream into utterances using a simple adaptive
// energy gate. Pure logic: feed it Float32Array chunks, get utterances back.

const SAMPLE_RATE = 16000;
const FRAME = 320; // 20 ms

export class Segmenter {
  constructor({
    sampleRate = SAMPLE_RATE,
    silenceMs = 650,
    minSpeechMs = 350,
    maxUtteranceMs = 14000,
    preRollMs = 200,
    minThreshold = 0.008,
    onUtterance,
  } = {}) {
    this.sampleRate = sampleRate;
    this.silenceFrames = Math.round(silenceMs / 20);
    this.minSpeechFrames = Math.round(minSpeechMs / 20);
    this.maxFrames = Math.round(maxUtteranceMs / 20);
    this.preRollFrames = Math.round(preRollMs / 20);
    this.minThreshold = minThreshold;
    this.onUtterance = onUtterance;

    this.noiseFloor = 0.003;
    this.pending = new Float32Array(0);
    this.preRoll = [];
    this.frames = [];
    this.speechFrames = 0;
    this.silentRun = 0;
    this.active = false;
  }

  push(chunk) {
    const merged = new Float32Array(this.pending.length + chunk.length);
    merged.set(this.pending);
    merged.set(chunk, this.pending.length);

    let offset = 0;
    while (offset + FRAME <= merged.length) {
      this._frame(merged.subarray(offset, offset + FRAME));
      offset += FRAME;
    }
    this.pending = merged.slice(offset);
  }

  flush() {
    if (this.active) this._emit();
  }

  _frame(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const threshold = Math.max(this.minThreshold, this.noiseFloor * 3);
    const isSpeech = rms > threshold;
    const copy = frame.slice();

    if (!isSpeech) this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02;

    if (!this.active) {
      if (isSpeech) {
        this.active = true;
        this.frames = [...this.preRoll, copy];
        this.speechFrames = 1;
        this.silentRun = 0;
        this.preRoll = [];
      } else {
        this.preRoll.push(copy);
        if (this.preRoll.length > this.preRollFrames) this.preRoll.shift();
      }
      return;
    }

    this.frames.push(copy);
    if (isSpeech) {
      this.speechFrames++;
      this.silentRun = 0;
    } else {
      this.silentRun++;
    }

    if (this.silentRun >= this.silenceFrames || this.frames.length >= this.maxFrames) {
      this._emit();
    }
  }

  _emit() {
    const enough = this.speechFrames >= this.minSpeechFrames;
    const frames = this.frames;
    this.active = false;
    this.frames = [];
    this.speechFrames = 0;
    this.silentRun = 0;
    if (!enough) return;

    const samples = new Float32Array(frames.length * FRAME);
    frames.forEach((f, i) => samples.set(f, i * FRAME));
    this.onUtterance?.({
      samples,
      durationMs: Math.round((samples.length / this.sampleRate) * 1000),
    });
  }
}
