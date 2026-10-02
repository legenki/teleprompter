// Shared speech-to-text engine: audio stream -> utterances -> local Whisper -> text events.
// Used by the Chrome offscreen document and, in Firefox, directly by the interview page.
import { env, pipeline } from '@huggingface/transformers';
import { Segmenter } from './segmenter.js';
import { isNoise } from './question.js';
import { geminiTranscribe, isFatalGeminiError } from './gemini-stt.js';

env.allowLocalModels = false;
env.useWasmCache = false; // wasm is bundled in the extension; the Cache API rejects extension URLs
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.mjs'),
  wasm: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.wasm'),
};
env.backends.onnx.wasm.numThreads = 1;

// send({ type: 'status' | 'text' | 'level' | 'error', ... })
export function createStt(send) {
  let transcriber = null;
  let loadedModel = null;
  let playbackCtx = null;
  let analysisCtx = null;
  let stream = null;
  let segmenter = null;
  let queue = Promise.resolve();
  let pendingJobs = 0;
  let cfg = { engine: 'whisper', model: '', gemini: null };
  let geminiOff = false;
  let previous = '';

  async function loadModel(model) {
    if (transcriber && loadedModel === model) return;
    transcriber = null;
    send({ type: 'status', state: 'loading', detail: `Loading speech model ${model}…` });

    const progress_callback = (p) => {
      if (p.status === 'progress' && p.total) {
        send({ type: 'status', state: 'loading', detail: `Speech model ${Math.round(p.progress)}%` });
      }
    };

    const hasWebGPU = !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
    try {
      if (!hasWebGPU) throw new Error('no webgpu');
      transcriber = await pipeline('automatic-speech-recognition', model, {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
        progress_callback,
      });
    } catch (e) {
      send({ type: 'status', state: 'loading', detail: 'WebGPU unavailable, using CPU…' });
      transcriber = await pipeline('automatic-speech-recognition', model, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback,
      });
    }
    loadedModel = model;
  }

  async function whisperText(samples) {
    await loadModel(cfg.model);
    const result = await transcriber(samples, { chunk_length_s: 30 });
    return (result.text || '').trim();
  }

  async function recognize(samples) {
    if (cfg.engine === 'gemini' && !geminiOff) {
      try {
        return await geminiTranscribe(samples, cfg.gemini, previous);
      } catch (e) {
        if (isFatalGeminiError(e)) {
          geminiOff = true;
          send({ type: 'status', state: 'loading', detail: `Gemini unavailable (${e.status}), switching to local Whisper…` });
          const text = await whisperText(samples);
          send({ type: 'status', state: 'listening', detail: 'Listening (local Whisper fallback)…' });
          return text;
        }
        send({ type: 'error', error: `Gemini: ${e.message} (this phrase used local Whisper)` });
      }
    }
    return whisperText(samples);
  }

  function transcribe(samples, durationMs) {
    pendingJobs++;
    queue = queue.then(async () => {
      try {
        const t0 = performance.now();
        const text = await recognize(samples);
        if (!isNoise(text)) {
          previous = text;
          send({ type: 'text', text, audioMs: durationMs, sttMs: Math.round(performance.now() - t0) });
        }
      } catch (e) {
        send({ type: 'error', error: `Transcription failed: ${e.message}` });
      } finally {
        pendingJobs--;
      }
    });
  }

  async function stop() {
    segmenter?.flush();
    segmenter = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    await playbackCtx?.close().catch(() => {});
    await analysisCtx?.close().catch(() => {});
    playbackCtx = analysisCtx = null;
  }

  // getStream: () => Promise<MediaStream>. playback: replay the stream (needed for muted tab capture).
  // engine: 'whisper' | 'gemini'. With gemini, Whisper is only loaded if Gemini fails.
  async function start({ getStream, model, playback = false, engine = 'whisper', gemini = null }) {
    await stop();
    if (engine === 'gemini' && !gemini?.key) throw new Error('Add a Gemini API key in settings to use Gemini speech recognition.');
    cfg = { engine, model, gemini };
    geminiOff = false;
    previous = '';
    if (engine === 'whisper') await loadModel(model);
    stream = await getStream();

    if (playback) {
      playbackCtx = new AudioContext();
      playbackCtx.createMediaStreamSource(stream).connect(playbackCtx.destination);
    }

    analysisCtx = new AudioContext({ sampleRate: 16000 });
    await analysisCtx.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
    const node = new AudioWorkletNode(analysisCtx, 'pcm-forwarder');
    analysisCtx.createMediaStreamSource(stream).connect(node);

    // Gemini costs one request per utterance: wait for longer pauses to send whole questions.
    segmenter = new Segmenter({
      ...(engine === 'gemini' && { silenceMs: 1100, maxUtteranceMs: 25000 }),
      onUtterance: ({ samples, durationMs }) => transcribe(samples, durationMs),
    });

    let lastLevel = 0;
    node.port.onmessage = (e) => {
      segmenter?.push(e.data);
      const now = performance.now();
      if (now - lastLevel > 150) {
        lastLevel = now;
        let sum = 0;
        for (const v of e.data) sum += v * v;
        send({ type: 'level', level: Math.min(1, Math.sqrt(sum / e.data.length) * 8), backlog: pendingJobs });
      }
    };

    stream.getAudioTracks()[0].addEventListener('ended', () => {
      stop();
      send({ type: 'status', state: 'idle', detail: 'Audio source ended' });
    });
    send({ type: 'status', state: 'listening', detail: 'Listening…' });
  }

  return { start, stop };
}
