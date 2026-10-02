// Offscreen document: captures tab audio, segments it, and transcribes locally with Whisper.
import { env, pipeline } from '@huggingface/transformers';
import { Segmenter } from './lib/segmenter.js';
import { isNoise } from './lib/question.js';

env.allowLocalModels = false;
env.useWasmCache = false; // wasm is bundled in the extension; the Cache API rejects chrome-extension:// URLs
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.mjs'),
  wasm: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.wasm'),
};
env.backends.onnx.wasm.numThreads = 1;

const send = (msg) => chrome.runtime.sendMessage({ from: 'offscreen', ...msg }).catch(() => {});

let transcriber = null;
let loadedModel = null;
let playbackCtx = null;
let analysisCtx = null;
let stream = null;
let segmenter = null;
let queue = Promise.resolve();
let pendingJobs = 0;

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
    send({ type: 'status', state: 'loading', detail: 'WebGPU unavailable, using CPU (slower)…' });
    transcriber = await pipeline('automatic-speech-recognition', model, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback,
    });
  }
  loadedModel = model;
}

function transcribe(samples, durationMs) {
  pendingJobs++;
  queue = queue.then(async () => {
    try {
      const t0 = performance.now();
      const result = await transcriber(samples, { chunk_length_s: 30 });
      const text = (result.text || '').trim();
      if (!isNoise(text)) {
        send({ type: 'text', text, audioMs: durationMs, sttMs: Math.round(performance.now() - t0) });
      }
    } catch (e) {
      send({ type: 'error', error: `Transcription failed: ${e.message}` });
    } finally {
      pendingJobs--;
    }
  });
}

async function start({ streamId, model }) {
  await stop();
  await loadModel(model);

  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });

  // Capturing a tab mutes it for the user, so play it back unchanged.
  playbackCtx = new AudioContext();
  playbackCtx.createMediaStreamSource(stream).connect(playbackCtx.destination);

  analysisCtx = new AudioContext({ sampleRate: 16000 });
  await analysisCtx.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
  const node = new AudioWorkletNode(analysisCtx, 'pcm-forwarder');
  analysisCtx.createMediaStreamSource(stream).connect(node);

  segmenter = new Segmenter({
    onUtterance: ({ samples, durationMs }) => transcribe(samples, durationMs),
  });

  let lastLevel = 0;
  node.port.onmessage = (e) => {
    segmenter.push(e.data);
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
    send({ type: 'status', state: 'idle', detail: 'Tab audio ended' });
  });
  send({ type: 'status', state: 'listening', detail: 'Listening…' });
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') {
    start(msg).catch((e) => {
      send({ type: 'error', error: e.message });
      send({ type: 'status', state: 'idle', detail: 'Stopped' });
    });
  } else if (msg.type === 'stop') {
    stop().then(() => send({ type: 'status', state: 'idle', detail: 'Stopped' }));
  }
});
